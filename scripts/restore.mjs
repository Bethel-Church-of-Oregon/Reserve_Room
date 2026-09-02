#!/usr/bin/env node
/**
 * Restore a backup produced by `scripts/backup.mjs` or by the monthly cron email.
 *
 *   npm run restore -- backups/2026-09-02T22-14-05           # 미리보기 (쓰지 않음)
 *   npm run restore -- backups/2026-09-02T22-14-05 --yes     # 실제 복원
 *   npm run restore -- ~/Downloads/backup-2026-09-01.json --yes
 *
 * Accepts either a backup folder or a single `backup.json` — the cron job emails
 * exactly that one file, and a backup you cannot restore from is not a backup.
 *
 * Reads the JSON and binds it as query parameters rather than executing
 * `restore.sql`, so nothing depends on parsing SQL text or on `psql` being
 * installed. `restore.sql` stays in the folder for anyone who has psql or wants
 * to paste into the Neon SQL editor.
 *
 * Every insert is `ON CONFLICT DO NOTHING`: this only ever adds rows that are
 * missing and can never overwrite or delete one that is already there, which is
 * what makes it safe against a partly-populated database.
 *
 * The schema must exist first — start the app once against the target database
 * so `ensureDbReady()` builds it. db.ts owns the schema; a copy here would drift.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_TABLES, SERIAL_TABLES } from '../src/lib/backup.mjs';
import { loadEnvLocal } from './env.mjs';

/** Postgres caps a statement at 65535 parameters; 100 rows keeps us far below. */
const CHUNK = 100;

loadEnvLocal();

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');

if (!target) {
  console.error('사용법: npm run restore -- <백업폴더 또는 backup.json> [--yes]');
  process.exit(1);
}

const file =
  existsSync(target) && statSync(target).isDirectory() ? join(target, 'backup.json') : target;
if (!existsSync(file)) {
  console.error(`${file} 을 찾을 수 없습니다. 백업 폴더나 backup.json 경로를 확인해 주세요.`);
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('POSTGRES_URL 또는 DATABASE_URL 이 필요합니다.');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(file, 'utf8'));
if (!backup.tables) {
  console.error(`${file} 은 이 도구가 만든 백업 형식이 아닙니다.`);
  process.exit(1);
}

const sql = neon(connectionString);

console.log(`백업: ${file}`);
console.log(`  백업 시각      ${backup.backedUpAt}`);
console.log(`  schema_version ${backup.schemaVersion ?? '(미기록)'}\n`);

// Show both sides before touching anything: the operator needs to see what is
// already in the target, not just what the backup holds.
console.log('  테이블                     현재 DB   백업파일');
for (const { name } of BACKUP_TABLES) {
  const rows = backup.tables[name] ?? [];
  let current = '?';
  try {
    const [row] = await sql.query(`SELECT count(*)::int c FROM ${name}`);
    current = row.c;
  } catch {
    current = '없음'; // table missing — the schema has not been created yet
  }
  console.log(`  ${name.padEnd(26)} ${String(current).padStart(6)}   ${String(rows.length).padStart(6)}`);
}

if (!confirmed) {
  console.log('\n미리보기입니다. 실제로 복원하려면 --yes 를 붙여 주세요.');
  console.log('기존 행은 덮어쓰지 않고, 없는 행만 추가합니다 (ON CONFLICT DO NOTHING).');
  process.exit(0);
}

console.log('\n복원 시작...\n');
let inserted = 0;

for (const { name } of BACKUP_TABLES) {
  const rows = backup.tables[name] ?? [];
  if (rows.length === 0) {
    console.log(`  ${name.padEnd(26)} 건너뜀 (백업이 비어 있음)`);
    continue;
  }

  const cols = Object.keys(rows[0]);
  let added = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const params = [];
    const tuples = rows.slice(i, i + CHUNK).map((r) => {
      const slots = cols.map((c) => {
        params.push(r[c] ?? null);
        return `$${params.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    const res = await sql.query(
      `INSERT INTO ${name} (${cols.join(', ')}) VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING RETURNING 1`,
      params
    );
    added += res.length;
  }

  inserted += added;
  const skipped = rows.length - added;
  console.log(`  ${name.padEnd(26)} ${String(added).padStart(5)}행 추가${skipped > 0 ? ` (${skipped}행은 이미 존재)` : ''}`);
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
