import { NextRequest, NextResponse } from 'next/server';
import { approveReservation, rejectReservation, deleteReservation, getReservationById, approveCancellation, rejectCancellation } from '@/lib/db';
import { sendApprovalEmail, sendRejectionEmail, sendCancellationApprovedEmail, sendCancellationRejectedEmail } from '@/lib/email';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const body = await req.json();
    const { action, reason } = body;

    if (action === 'approve') {
      // 승인 전에 예약 정보 조회
      const reservation = await getReservationById(id);
      const ok = await approveReservation(id);
      if (!ok) return NextResponse.json({ error: '승인할 수 없습니다.' }, { status: 400 });

      // 이메일 발송 (실패해도 승인은 유지)
      if (reservation) {
        sendApprovalEmail(reservation).catch((e) =>
          console.error('[email] 승인 이메일 발송 실패:', e)
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'reject') {
      if (!reason?.trim()) {
        return NextResponse.json({ error: '거절 사유를 입력해주세요.' }, { status: 400 });
      }

      // 거절 전에 예약 정보 조회
      const reservation = await getReservationById(id);
      const ok = await rejectReservation(id, reason);
      if (!ok) return NextResponse.json({ error: '거절할 수 없습니다.' }, { status: 400 });

      // 이메일 발송 (실패해도 거절은 유지)
      if (reservation) {
        sendRejectionEmail(reservation, reason).catch((e) =>
          console.error('[email] 거절 이메일 발송 실패:', e)
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'approve_cancellation') {
      const reservation = await getReservationById(id);
      const ok = await approveCancellation(id);
      if (!ok) return NextResponse.json({ error: '취소 승인할 수 없습니다.' }, { status: 400 });

      if (reservation) {
        sendCancellationApprovedEmail(reservation).catch((e) =>
          console.error('[email] 취소 승인 이메일 발송 실패:', e)
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'reject_cancellation') {
      const reservation = await getReservationById(id);
      const ok = await rejectCancellation(id);
      if (!ok) return NextResponse.json({ error: '취소 거절할 수 없습니다.' }, { status: 400 });

      if (reservation) {
        sendCancellationRejectedEmail(reservation, reason?.trim() || undefined).catch((e) =>
          console.error('[email] 취소 거절 이메일 발송 실패:', e)
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const ok = await deleteReservation(id);
    if (!ok) return NextResponse.json({ error: '삭제할 수 없습니다. 승인된 예약만 삭제 가능합니다.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
