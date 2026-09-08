import { NextResponse } from 'next/server';
import { getBlackouts } from '@/lib/db';

// Same reasoning as `/api/access-code`: this handler reads no request data, so
// Next would render it once and serve that answer forever, and `fetchCache`
// matters as much as `dynamic` because the Neon driver talks over fetch — a rule
// the administrator just saved would otherwise stay invisible for a while.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Blackout rules, for the calendar and the reservation form to display.
 *
 * Public: a rule is a label, a room and a time window — the same information the
 * calendar already shows about every booking, and the whole point is that a
 * member can see why a slot is unavailable before they try to take it.
 */
export async function GET() {
  try {
    return NextResponse.json(await getBlackouts());
  } catch (e) {
    console.error(e);
    // Fail open, like the access code: the form falls back to its own message
    // and the server still refuses the booking on submit.
    return NextResponse.json([]);
  }
}
