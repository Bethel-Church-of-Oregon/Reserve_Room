import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { getReservationAccessCode, setReservationAccessCode } from '@/lib/db';
import { LIMITS } from '@/lib/constants';

function isAdmin() {
  return verifyAdminSession(cookies().get('admin_auth')?.value);
}

/** Returns the code itself — administrators need to read it to share it. */
export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  try {
    const code = await getReservationAccessCode();
    return NextResponse.json({ code: code ?? '' });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/** An empty string turns the gate off. */
export async function PUT(req: NextRequest) {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  try {
    const body = await req.json();
    const code = String(body?.code ?? '').trim();

    if (code.length > LIMITS.accessCode) {
      return NextResponse.json(
        { error: `예약 코드는 ${LIMITS.accessCode}자 이하여야 합니다.` },
        { status: 400 }
      );
    }
    // Whitespace inside a code people type by hand causes needless failures.
    if (/\s/.test(code)) {
      return NextResponse.json({ error: '예약 코드에 공백은 사용할 수 없습니다.' }, { status: 400 });
    }

    await setReservationAccessCode(code || null);
    return NextResponse.json({ code, enabled: Boolean(code) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
