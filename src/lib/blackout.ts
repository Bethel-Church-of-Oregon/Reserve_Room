/**
 * Time windows in which a room cannot be booked — worship services and the like.
 *
 * Unlike a reservation, a blackout is a *standing rule* rather than a row per
 * occurrence: "every Sunday, forever" is one record, not five hundred. That is
 * the whole reason it is not modelled as reservations — the recurring booking
 * path caps at 500 occurrences and would need topping up every few years, and
 * every backup, admin search, cancel and edit path would then have to learn to
 * filter these rows out.
 *
 * The evaluation is pure and lives here rather than in `db.ts` so that the
 * reservation form can run, on the client, exactly the rule the server enforces
 * on write. Only the fetch differs. `db.ts` imports the Neon driver, so a client
 * component cannot pull a function out of it.
 *
 * No database constraint backs this, unlike double-booking. The exclusion
 * constraint exists because two concurrent requests can both pass a SELECT;
 * a blackout is static, so nothing can change between the check and the write
 * and one server-side check is genuinely sufficient.
 */

import { weekdayOfKey } from './date';

export type BlackoutRecurring = 'daily' | 'weekly';

export const BLACKOUT_RECURRING: BlackoutRecurring[] = ['daily', 'weekly'];

/**
 * `monthly` is deliberately absent. It splits into "fourth Sunday", "the 25th"
 * and "last Friday", each a separate rule, and the day-of-month reading — the
 * one the recurring booking path already uses — lands on a different weekday
 * every month, which is close to useless for a service time. `date_from` /
 * `date_to` covers what people usually mean by a monthly rule: "for a while".
 */
export interface RoomBlackout {
  id: number;
  label: string;
  /** null applies the rule to every room. */
  room_id: number | null;
  /** Joined for display; null when the rule covers every room. */
  room_name?: string | null;
  recurring: BlackoutRecurring;
  /** 0 = Sunday. Set for 'weekly', null for 'daily'. */
  weekday: number | null;
  /** 'HH:MM' */
  start_time: string;
  /** 'HH:MM' */
  end_time: string;
  /** 'YYYY-MM-DD', or null for no lower bound. */
  date_from: string | null;
  /** 'YYYY-MM-DD', or null for no upper bound (the usual case). */
  date_to: string | null;
}

/** Whether the rule is in force on a given calendar date, ignoring the time. */
export function blackoutAppliesOn(b: RoomBlackout, dateKey: string): boolean {
  if (b.date_from && dateKey < b.date_from) return false;
  if (b.date_to && dateKey > b.date_to) return false;
  if (b.recurring === 'daily') return true;
  return b.weekday === weekdayOfKey(dateKey);
}

/** Rules in force for one room on one date, earliest first. */
export function blackoutsOnDate(
  blackouts: RoomBlackout[],
  roomId: number,
  dateKey: string
): RoomBlackout[] {
  return blackouts
    .filter((b) => (b.room_id === null || b.room_id === roomId) && blackoutAppliesOn(b, dateKey))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/**
 * The first rule a proposed booking runs into, or null.
 *
 * Compares full 'YYYY-MM-DDTHH:MM:SS' strings rather than bare 'HH:MM', which
 * keeps it correct for a booking that runs past midnight — the creation route
 * does not require start and end to share a date — and matches how every other
 * time comparison in this app is done.
 *
 * Half-open `[)`, the same rule as `checkConflict` and the exclusion
 * constraint: a service ending at 15:30 does not block a booking starting then.
 */
export function findBlackout(
  blackouts: RoomBlackout[],
  roomId: number,
  startTime: string,
  endTime: string
): RoomBlackout | null {
  const dateKey = startTime.slice(0, 10);
  for (const b of blackoutsOnDate(blackouts, roomId, dateKey)) {
    if (startTime < `${dateKey}T${b.end_time}:00` && endTime > `${dateKey}T${b.start_time}:00`) {
      return b;
    }
  }
  return null;
}
