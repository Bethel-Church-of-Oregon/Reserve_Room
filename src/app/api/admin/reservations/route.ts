import { NextResponse } from 'next/server';
import { getAllReservationsForAdmin } from '@/lib/db';
import { cookies } from 'next/headers';

export function GET() {
  const cookieStore = cookies();
  if (cookieStore.get('admin_auth')?.value !== 'true') {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const reservations = getAllReservationsForAdmin();
    return NextResponse.json(reservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
