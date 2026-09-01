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

/** Shape of a reservation timestamp: 'YYYY-MM-DDTHH:MM' with optional seconds. */
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** 'YYYY-MM-DD', the shape of a recurrence end date. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a reservation timestamp and normalize it to the 19-character form
 * the database stores ('2026-03-10T09:00:00'). Returns null if it is not a real
 * instant.
 *
 * Both halves matter. The shape check alone lets '2026-02-30T25:00' through,
 * which Postgres then refuses when the overlap constraint builds a timestamp
 * from it — surfacing as a 500 rather than a 400. And normalizing here is what
 * keeps every stored value the same length, since the whole app compares these
 * timestamps as plain strings; a 16-character row would silently mis-sort
 * against 19-character ones.
 */
export function normalizeDateTime(raw: string): string | null {
  if (!DATETIME_RE.test(raw)) return null;

  const [datePart, timePart] = raw.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);

  if (m < 1 || m > 12 || d < 1 || hh > 23 || mm > 59 || ss > 59) return null;

  // Rejects day-of-month overflow (Feb 30, Apr 31) and two-digit-year coercion.
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return null;
  }

  return `${datePart}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
}
