/**
 * Shared backup logic for both the CLI (`npm run backup`) and the monthly cron
 * route that emails a copy.
 *
 * Plain ESM rather than TypeScript so the scripts in `scripts/` can import it
 * with bare Node — adding a TypeScript runner as a dependency just to run a
 * backup would be one more thing that has to be installed before the backup
 * works, and the whole point is that it always works.
 *
 * Takes a `query` function rather than opening its own connection, and never
 * touches `ensureDbReady()`: a backup should read the database exactly as it
 * finds it, not run migrations against it.
 */

/** Parents before children — a restore has to insert rooms before reservations. */
export const BACKUP_TABLES = [
  { name: 'rooms', order: 'id' },
  { name: 'app_settings', order: 'key' },
  { name: 'notification_recipients', order: 'id' },
  { name: 'reservation_series', order: 'created_at' },
  { name: 'reservations', order: 'id' },
];

/** Tables whose integer id comes from a sequence a restore has to catch up. */
export const SERIAL_TABLES = ['rooms', 'notification_recipients', 'reservations'];

/**
 * @param {(text: string, params?: unknown[]) => Promise<any[]>} query
 * @returns {Promise<{backedUpAt: string, schemaVersion: string|null, databaseSize: string, rowCounts: Record<string, number>, tables: Record<string, any[]>}>}
 */
export async function collectBackup(query) {
  const tables = {};
  const rowCounts = {};

  for (const { name, order } of BACKUP_TABLES) {
    // Names come from the constant above, never from input.
    const rows = await query(`SELECT * FROM ${name} ORDER BY ${order}`);
    tables[name] = rows;
    rowCounts[name] = rows.length;
  }

  const [{ size }] = await query(
    'SELECT pg_size_pretty(pg_database_size(current_database())) AS size'
  );
  const schemaRows = await query("SELECT value FROM app_settings WHERE key = 'schema_version'");

  return {
    backedUpAt: new Date().toISOString(),
    schemaVersion: schemaRows[0]?.value ?? null,
    databaseSize: size,
    rowCounts,
    tables,
  };
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // Postgres string literal: double every embedded quote. Backslashes need no
  // escaping because standard_conforming_strings is on by default.
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * A portable copy for anyone holding psql or the Neon SQL editor. The restore
 * script does not use this — it binds the JSON as query parameters instead, so
 * a restore never depends on parsing SQL text back out again.
 */
export function toRestoreSql(backup) {
  const out = [
    '-- 오레곤벧엘장로교회 장소예약 데이터 복원 스크립트',
    `-- 백업 시각: ${backup.backedUpAt}`,
    `-- schema_version: ${backup.schemaVersion ?? '(미기록)'}`,
    '--',
    '-- 사용법: 먼저 앱을 대상 DB 로 한 번 실행해 스키마를 만든 뒤 이 파일을 실행하세요.',
    '-- 스키마는 db.ts 의 ensureDbReady() 가 단일 출처이므로 여기 복사해 두지 않았습니다.',
    '',
    'BEGIN;',
    '',
  ];

  for (const { name } of BACKUP_TABLES) {
    const rows = backup.tables[name];
    if (!rows || rows.length === 0) {
      out.push(`-- ${name}: 비어 있음`, '');
      continue;
    }
    const cols = Object.keys(rows[0]);
    out.push(`-- ${name} (${rows.length}행)`);
    // Chunked so no statement grows unreadable, and so a failure during restore
    // points at one block rather than the whole table.
    for (let i = 0; i < rows.length; i += 100) {
      const values = rows
        .slice(i, i + 100)
        .map((r) => `  (${cols.map((c) => sqlLiteral(r[c])).join(', ')})`)
        .join(',\n');
      out.push(
        `INSERT INTO ${name} (${cols.join(', ')}) VALUES\n${values}\nON CONFLICT DO NOTHING;`
      );
    }
    out.push('');
  }

  out.push('-- 시퀀스를 복원된 최대 id 로 맞춤 (안 하면 다음 INSERT 가 충돌)');
  for (const t of SERIAL_TABLES) {
    out.push(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1));`
    );
  }
  out.push('', 'COMMIT;', '');
  return out.join('\n');
}

/** Spreadsheet view of the one table a person is ever likely to open by hand. */
export function reservationsCsv(backup) {
  const rows = [...(backup.tables.reservations ?? [])].sort((a, b) =>
    String(a.start_time).localeCompare(String(b.start_time))
  );
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Total rows across every table, for the one-line summary both callers print. */
export function totalRows(backup) {
  return Object.values(backup.rowCounts).reduce((a, b) => a + b, 0);
}
