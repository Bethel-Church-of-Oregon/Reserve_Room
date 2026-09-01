import { NextResponse } from 'next/server';
import { getReservationAccessCode } from '@/lib/db';

// This handler reads no request data, so Next would render it once and serve the
// cached answer forever — the form would never notice the code being turned on.
// `fetchCache` matters as much as `dynamic`: the Neon driver talks over fetch, so
// without it the settings lookup itself is served from Next's data cache and the
// answer stays stale for a while after the administrator changes the code.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Tells the reservation form whether to ask for a code. Deliberately returns only
 * whether one is required — never the code itself.
 */
export async function GET() {
  try {
    const code = await getReservationAccessCode();
    return NextResponse.json({ required: Boolean(code) });
  } catch (e) {
    console.error(e);
    // Fail open: a settings lookup problem must not block reservations.
    return NextResponse.json({ required: false });
  }
}
