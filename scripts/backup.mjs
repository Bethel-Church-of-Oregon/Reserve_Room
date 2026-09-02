#!/usr/bin/env node
/**
 * Point-in-time export of the reservation database.
 *
 * Why this exists: Neon's Free plan keeps only six hours of instant-restore
 * history. Data lost on a Monday and noticed on a Wednesday is unrecoverable,
 * and the riskiest operation in this project is a manual `DELETE FROM
 * reservations` run from the Neon console during a room reorganization.
 *
 * A monthly copy is emailed automatically by `/api/cron/backup`; this script is
 * the one to run deliberately, right before doing something destructive.
 *
 *   npm run backup
 *
 * Output lands in `backups/<timestamp>/` (gitignored — the export contains
 * members' email addresses, which are also the credential the cancel and edit
 * routes check).
 *
 *   backup.json      everything in one file — this is what `npm run restore` reads
 *   <table>.json     the same rows split per table, for reading
 *   reservations.csv spreadsheet-friendly view
 *   restore.sql      ordered INSERTs plus sequence resets, for psql users
 *
 * To restore: point the app at the target database and start it once so
 * `ensureDbReady()` builds the schema, then `npm run restore -- <folder> --yes`.
 */

import { neon } from '@neondatabase/serverless';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectBackup, toRestoreSql, reservationsCsv, totalRows } from '../src/lib/backup.mjs';
import { loadEnvLocal } from './env.mjs';

loadEnvLocal();

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('POSTGRES_URL 또는 DATABASE_URL 이 필요합니다. .env.local 을 확인해 주세요.');
  process.exit(1);
}

const sql = neon(connectionString);
const backup = await collectBackup((text, params) => sql.query(text, params));

// Colons and dots are awkward in directory names on some filesystems.
const stamp = backup.backedUpAt.replace(/[:.]/g, '-').slice(0, 19);
const dir = join('backups', stamp);
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, 'backup.json'), `${JSON.stringify(backup, null, 2)}\n`);
for (const [name, rows] of Object.entries(backup.tables)) {
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`);
}
writeFileSync(join(dir, 'reservations.csv'), `${reservationsCsv(backup)}\n`);
writeFileSync(join(dir, 'restore.sql'), toRestoreSql(backup));

console.log(`백업 → ${dir}\n`);
for (const [name, n] of Object.entries(backup.rowCounts)) {
  console.log(`  ${name.padEnd(24)} ${String(n).padStart(5)}행`);
}
console.log(`\n  DB 크기 ${backup.databaseSize} · schema_version ${backup.schemaVersion ?? '(미기록)'}`);
console.log(`  총 ${totalRows(backup)}행`);

// A backup that silently wrote nothing is worse than no backup, because it looks
// like protection. Fail loudly instead.
if (backup.rowCounts.reservations === 0) {
  console.error('\n⚠ 예약이 0행입니다. 연결 대상 DB 가 맞는지 확인해 주세요.');
  process.exit(1);
}

console.log('\n완료. 이 폴더에는 예약자 이메일이 들어 있으니 공유하지 마세요 (backups/ 는 gitignore 처리됨).');
