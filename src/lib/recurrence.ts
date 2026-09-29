import { addDays, addMonths, format } from 'date-fns';

/** Largest gap the form offers: every 4 days, weeks, or months. */
export const RECURRING_INTERVAL_MAX = 4;

const MAX_OCCURRENCES = 500;

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

function dateAdd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return format(addDays(new Date(y, m - 1, d), days), 'yyyy-MM-dd');
}

function monthAdd(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return format(addMonths(new Date(y, m - 1, d), months), 'yyyy-MM-dd');
}

/**
 * Dates from the start through `recurringUntil`, stepping by `interval`
 * days, weeks, or months. Interval 1 is every day / week / month.
 * The list stops at 500 dates, the same cap a weekly series used before
 * an interval existed.
 */
export function generateOccurrences(
  startTime: string,
  endTime: string,
  recurring: RecurringFrequency,
  recurringUntil: string,
  interval: number,
): Array<{ start_time: string; end_time: string }> {
  const startTimeSuffix = startTime.slice(10);
  const endTimeSuffix = endTime.slice(10);

  const results: Array<{ start_time: string; end_time: string }> = [];
  let currentDate = startTime.slice(0, 10);

  while (currentDate <= recurringUntil && results.length < MAX_OCCURRENCES) {
    results.push({
      start_time: currentDate + startTimeSuffix,
      end_time: currentDate + endTimeSuffix,
    });

    if (recurring === 'daily') {
      currentDate = dateAdd(currentDate, interval);
    } else if (recurring === 'weekly') {
      currentDate = dateAdd(currentDate, 7 * interval);
    } else {
      currentDate = monthAdd(currentDate, interval);
    }
  }

  return results;
}
