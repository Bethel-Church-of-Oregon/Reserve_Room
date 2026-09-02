#!/usr/bin/env node
/**
 * Restore a backup produced by `scripts/backup.mjs`.
 *
 *   npm run restore -- backups/2026-09-02T22-14-05          # 미리보기 (쓰지 않음)
 *   npm run restore -- backups/2026-09-02T22-14-05 --yes    # 실제 복원
 *
 * Reads the per-table JSON rather than executing `restore.sql`, so nothing
 * depends on SQL text parsing or on `psql` being installed — values travel as
 * query parameters and cannot be mis-escaped. `restore.sql` stays in the backup
 * for anyone who does have psql or the Neon SQL editor.
 *
 * Every insert is `ON CONFLICT DO NOTHING`, so this only ever adds rows that are
 * missing. It cannot overwrite or delete a row that is already there, which is
 * what makes it safe to run against a database that is partly populated.
 *
 * The schema must exist first: start the app once against the target database so
 * `ensureDbReady()` builds it. db.ts is the single source of truth for the
 * schema and is deliberately not duplicated here.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
    if (process.env[key]) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

/** Parents before children: reservations reference both rooms and series. */
const TABLES = ['rooms', 'app_settings', 'notification_recipients', 'reservation_series', 'reservations'];
const SERIAL_TABLES = ['rooms', 'notification_recipients', 'reservations'];

/** Postgres caps a statement at 65535 parameters; 100 rows keeps us far below. */
const CHUNK = 100;

loadEnvLocal();

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');

if (!dir) {
  console.error('사용법: npm run restore -- <백업폴더> [--yes]');
  process.exit(1);
}
if (!existsSync(join(dir, 'manifest.json'))) {
  console.error(`${dir} 에서 manifest.json 을 찾을 수 없습니다. 백업 폴더 경로를 확인해 주세요.`);
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('POSTGRES_URL 또는 DATABASE_URL 이 필요합니다.');
  process.exit(1);
}

const sql = neon(connectionString);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

console.log(`백업: ${dir}`);
console.log(`  백업 시각      ${manifest.backedUpAt}`);
console.log(`  schema_version ${manifest.schemaVersion ?? '(미기록)'}\n`);

// Show both sides before touching anything: the operator needs to see what is
// already in the target, not just what the backup holds.
console.log('  테이블                     현재 DB   백업파일');
const data = {};
for (const t of TABLES) {
  data[t] = JSON.parse(readFileSync(join(dir, `${t}.json`), 'utf8'));
  let current = '?';
  try {
    const [row] = await sql.query(`SELECT count(*)::int c FROM ${t}`);
    current = row.c;
  } catch {
    current = '없음'; // table missing — the schema has not been created yet
  }
  console.log(`  ${t.padEnd(26)} ${String(current).padStart(6)}   ${String(data[t].length).padStart(6)}`);
}

if (!confirmed) {
  console.log('\n미리보기입니다. 실제로 복원하려면 --yes 를 붙여 주세요.');
  console.log('기존 행은 덮어쓰지 않고, 없는 행만 추가합니다 (ON CONFLICT DO NOTHING).');
  process.exit(0);
}

console.log('\n복원 시작...\n');
let inserted = 0;

for (const t of TABLES) {
  const rows = data[t];
  if (rows.length === 0) {
    console.log(`  ${t.padEnd(26)} 건너뜀 (백업이 비어 있음)`);
    continue;
  }

  const cols = Object.keys(rows[0]);
  let added = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = chunk.map((r) => {
      const slots = cols.map((c) => {
        params.push(r[c] ?? null);
        return `$${params.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    const res = await sql.query(
      `INSERT INTO ${t} (${cols.join(', ')}) VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING RETURNING 1`,
      params
    );
    added += res.length;
  }

  inserted += added;
  const skipped = rows.length - added;
  console.log(`  ${t.padEnd(26)} ${String(added).padStart(5)}행 추가${skipped > 0 ? ` (${skipped}행은 이미 존재)` : ''}`);
}

// An id-preserving restore leaves each sequence behind its own data, so the very
// next INSERT from the app would collide with a restored row.
for (const t of SERIAL_TABLES) {
  await sql.query(
    `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`
  );
}
console.log(`\n  시퀀스 ${SERIAL_TABLES.length}개를 복원된 최대 id 로 맞춤`);
console.log(`\n완료. 총 ${inserted}행 추가.`);
