import { NextRequest, NextResponse } from 'next/server';
import { getAllReservationsForAdmin } from '@/lib/db';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const from = req.nextUrl.searchParams.get('from') ?? undefined;
    const reservations = await getAllReservationsForAdmin(from);
    return NextResponse.json(reservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// 일괄 승인: POST { action: 'approve', ids: number[] }
