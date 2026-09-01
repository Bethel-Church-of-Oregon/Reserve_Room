/**
 * All "today" / "now" decisions in this app are made in church-local time
 * (US Pacific), never in the browser's or the server's zone. Vercel runs on UTC
 * and members travel, so `new Date()` alone would roll over to tomorrow during
 * Pacific evening and silently block same-day reservations and edits.
 *
 * DST is handled by `Intl.DateTimeFormat`, so PST/PDT needs no special casing.
 */
export const PACIFIC_TZ = 'America/Los_Angeles';

function pacificParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** 'YYYY-MM-DD' for the given instant (default: now) in Pacific time. */
export function pacificDateKey(d: Date = new Date()): string {
  const p = pacificParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * A Date whose *local* year/month/day match today's Pacific calendar date, at
 * local midnight. Use this for calendar navigation state: the views read it back
 * with local getters (`getFullYear()` etc.), so it must be local-midnight rather
 * than a true Pacific instant.
 */
export function pacificTodayDate(): Date {
  const p = pacificParts(new Date());
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
}

/** Pacific wall-clock date plus minutes-since-midnight — for the current-time line. */
export function pacificNow(): { dateKey: string; totalMinutes: number } {
  const p = pacificParts(new Date());
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    totalMinutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/**
 * 'YYYY-MM-DD' from a Date's *local* components. Calendar grid cells are
 * local-midnight Dates standing for Pacific calendar days (see
 * `pacificTodayDate`), so their keys come from local getters — comparing those
 * keys against `pacificDateKey()` is correct.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
