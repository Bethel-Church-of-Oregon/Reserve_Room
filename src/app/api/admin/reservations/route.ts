import { NextRequest, NextResponse } from 'next/server';
import { getAllReservationsForAdmin, approveReservation, getReservationById } from '@/lib/db';
import { sendBulkApprovalEmail } from '@/lib/email';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';

export async function GET() {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const reservations = await getAllReservationsForAdmin();
    return NextResponse.json(reservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// 일괄 승인: POST { action: 'approve', ids: number[] }
export async function POST(req: NextRequest) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { action, ids } = await req.json();

    if (action !== 'approve' || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    // 승인 처리 및 예약 정보 수집
    const approved = [];
    for (const id of ids) {
      const reservation = await getReservationById(Number(id));
      const ok = await approveReservation(Number(id));
      if (ok && reservation) approved.push(reservation);
    }

    // 이메일 일괄 발송 (실패해도 승인은 유지)
    sendBulkApprovalEmail(approved).catch((e) =>
      console.error('[email] 일괄 승인 이메일 발송 실패:', e)
    );

    return NextResponse.json({ approved: approved.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
