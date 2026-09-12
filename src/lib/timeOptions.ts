/**
 * The 15-minute grid both booking screens pick times on, and the rule that keeps
 * an end after its start.
 *
 * This lives here rather than in either screen because the reservation form and
 * the edit modal have to agree. A byte-identical copy of the generator already
 * sat in both files, and a rule kept in two places is one that eventually
 * differs in one of them.
 */

/** '00:00' … '23:45'. Zero-padded, so plain string comparison orders them. */
export const TIME_OPTIONS: string[] = (() => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
})();

/**
 * Choices for the start field — everything but the final slot.
 *
 * Both screens build the start and the end from the same date, so a booking
 * starting at 23:45 has no end left to pick that day and would leave the end
 * field with nothing to show. Dropping it here states the limit instead of
 * letting the other field go empty; `validate()` already rejected such a pair.
 */
export const START_TIME_OPTIONS: string[] = TIME_OPTIONS.slice(0, -1);

/**
 * Choices for the end field: strictly after `start`. The app treats a booking as
 * half-open [start, end), so equal ends are not a zero-length booking — they are
 * not a booking at all.
 */
export function endTimeOptions(start: string): string[] {
  return TIME_OPTIONS.filter((t) => t > start);
}

/**
 * Where the end belongs once the start has moved past it.
 *
 * Keeps the length the booking already had — moving 09:00–10:00 to a 14:00 start
 * gives 14:00–15:00 — and stops at the last slot rather than running off the
 * grid. Counting in grid steps rather than minutes keeps the result on the grid
 * by construction.
 */
export function endTimeForNewStart(prevStart: string, prevEnd: string, nextStart: string): string {
  const steps = Math.max(TIME_OPTIONS.indexOf(prevEnd) - TIME_OPTIONS.indexOf(prevStart), 1);
  const start = TIME_OPTIONS.indexOf(nextStart);
  return TIME_OPTIONS[Math.min(start + steps, TIME_OPTIONS.length - 1)];
}
