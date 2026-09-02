#!/usr/bin/env node
/**
 * Point-in-time export of the reservation database.
 *
 * Why this exists: Neon's Free plan keeps only six hours of instant-restore
 * history. Data lost on a Monday and noticed on a Wednesday is unrecoverable,
 * and the riskiest operation in this project is a manual `DELETE FROM
 * reservations` run from the Neon console during a room reorganization. Six
 * months of booking history sits behind that one statement.
 *
 * Run before anything destructive, and on a monthly rhythm otherwise:
 *
 *   npm run backup
 *
 * Output lands in `backups/<timestamp>/` (gitignored — the export contains
 * members' email addresses, which are also the credential the cancel and edit
 * routes check).
 *
 *   <table>.json    one array per table, for reading and for re-import
 *   reservations.csv spreadsheet-friendly view of the table people actually read
 *   restore.sql     ordered INSERTs plus sequence resets
 *   manifest.json   row counts and schema version, to verify a backup at a glance
 *
 * To restore: point the app at the target database and start it once, so
 * `ensureDbReady()` builds the schema, then run `restore.sql` against it. The
 * schema is deliberately not duplicated here — db.ts is its single source of
 * truth, and a copy in this script would drift.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* -------------------------------------------------------------------------- */

/**
 * Node 18 has no `--env-file`, and Next loads `.env.local` only for the app, so
 * a standalone script has to read it itself. Kept dependency-free on purpose:
 * a backup tool that needs an install is a backup tool nobody runs.
 */
function loadEnvLocal() {
  let text;
  try {
    text = readFileSync('.env.local', 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue; // a real environment variable always wins
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

/** Tables in dependency order: a restore must insert parents before children. */
const TABLES = [
  { name: 'rooms', order: 'id' },
  { name: 'app_settings', order: 'key' },
  { name: 'notification_recipients', order: 'id' },
  { name: 'reservation_series', order: 'created_at' },
  { name: 'reservations', order: 'id' },
];

/** Tables whose integer id comes from a sequence that a restore has to catch up. */
const SERIAL_TABLES = ['rooms', 'notification_recipients', 'reservations'];

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // Postgres string literal: double every embedded quote. Backslashes need no
  // special handling because standard_conforming_strings is on by default.
  return `'${String(v).replace(/'/g, "''")}'`;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/* -------------------------------------------------------------------------- */

loadEnvLocal();

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('POSTGRES_URL 또는 DATABASE_URL 이 필요합니다. .env.local 을 확인해 주세요.');
  process.exit(1);
}

const sql = neon(connectionString);

// Colons and dots are awkward in directory names on some filesystems.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = join('backups', stamp);
mkdirSync(dir, { recursive: true });

const counts = {};
const statements = [];

console.log(`백업 시작 → ${dir}\n`);

for (const { name, order } of TABLES) {
  // `sql.query` is the driver's entry point for a non-template statement, which
  // is what a table-by-table dump needs. Table and column names come from the
  // TABLES constant above, never from input.
  const rows = await sql.query(`SELECT * FROM ${name} ORDER BY ${order}`);
  counts[name] = rows.length;

  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`  ${name.padEnd(24)} ${String(rows.length).padStart(5)}행`);

  if (rows.length === 0) {
    statements.push(`-- ${name}: 비어 있음`, '');
    continue;
  }

  const cols = Object.keys(rows[0]);
  statements.push(`-- ${name} (${rows.length}행)`);

  // Chunked so no single statement grows unreadably long, and so a failure
  // during restore points at a specific block rather than the whole table.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = chunk
      .map((r) => `  (${cols.map((c) => sqlLiteral(r[c])).join(', ')})`)
      .join(',\n');
    statements.push(
      `INSERT INTO ${name} (${cols.join(', ')}) VALUES\n${values}\nON CONFLICT DO NOTHING;`
    );
  }
  statements.push('');
}

writeFileSync(join(dir, 'reservations.csv'), `${toCsv(await sql`SELECT * FROM reservations ORDER BY start_time`)}\n`);

// Sequences are left behind by an id-preserving restore, so the next INSERT
// would collide with a restored row. Reset them from the data itself.
statements.push('-- 시퀀스를 복원된 최대 id 로 맞춤 (안 하면 다음 INSERT 가 충돌)');
for (const t of SERIAL_TABLES) {
  statements.push(
    `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1));`
  );
}

const [{ size }] = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
const schemaRows = await sql`SELECT value FROM app_settings WHERE key = 'schema_version'`;
const schemaVersion = schemaRows[0]?.value ?? null;

writeFileSync(
  join(dir, 'restore.sql'),
  [
    `-- 오레곤벧엘장로교회 장소예약 데이터 복원 스크립트`,
    `-- 백업 시각: ${new Date().toISOString()}`,
    `-- schema_version: ${schemaVersion ?? '(미기록)'}`,
    '--',
    '-- 사용법: 먼저 앱을 대상 DB 로 한 번 실행해 스키마를 만든 뒤 이 파일을 실행하세요.',
    '-- 스키마는 db.ts 의 ensureDbReady() 가 단일 출처이므로 여기 복사해 두지 않았습니다.',
    '',
    'BEGIN;',
    '',
    ...statements,
    '',
    'COMMIT;',
    '',
  ].join('\n')
);

writeFileSync(
  join(dir, 'manifest.json'),
  `${JSON.stringify({ backedUpAt: new Date().toISOString(), schemaVersion, databaseSize: size, rowCounts: counts }, null, 2)}\n`
);

const total = Object.values(counts).reduce((a, b) => a + b, 0);

console.log(`\n  DB 크기 ${size} · schema_version ${schemaVersion ?? '(미기록)'}`);
console.log(`  총 ${total}행 → ${dir}/`);

// A backup that silently wrote nothing is worse than no backup, because it
// looks like protection. Fail loudly instead.
if (counts.reservations === 0) {
  console.error('\n⚠ 예약이 0행입니다. 연결 대상 DB 가 맞는지 확인해 주세요.');
  process.exit(1);
}

console.log('\n완료. 이 폴더에는 예약자 이메일이 들어 있으니 공유하지 마세요 (backups/ 는 gitignore 처리됨).');
