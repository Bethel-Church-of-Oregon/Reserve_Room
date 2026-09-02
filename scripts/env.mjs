import { readFileSync } from 'node:fs';

/**
 * Node 18 has no `--env-file`, and Next loads `.env.local` only for the app, so
 * a standalone script has to read it itself. Kept dependency-free on purpose: a
 * backup tool that needs an install is a backup tool nobody runs.
 *
 * A real environment variable always wins, so CI or a one-off
 * `POSTGRES_URL=... npm run backup` can point the script at another database.
 */
export function loadEnvLocal(path = '.env.local') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
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
