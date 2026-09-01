import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { getRooms } from '@/lib/db';

// The Neon driver talks over fetch, so opting out of both caches is needed or a
// room's hidden flag keeps returning its old value after a change.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Visible rooms by default. Retired rooms are included only when the caller asks
 * for them with `?all=true` *and* holds an admin session — keying off the cookie
 * alone would hand the full list to an administrator who is filling in the
 * ordinary member form, which is exactly where retired rooms must not appear.
 */
export async function GET(req: NextRequest) {
  try {
    const wantsAll = req.nextUrl.searchParams.get('all') === 'true';
    const isAdmin = wantsAll && verifyAdminSession(cookies().get('admin_auth')?.value);
    const rooms = await getRooms(isAdmin);

    return NextResponse.json(rooms, {
      // The body depends on the session cookie, so it must never be reused from a
      // browser or proxy cache across auth states.
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
