import { NextRequest, NextResponse } from 'next/server';
import {
  approveReservationsBySeries,
  setReservationSeriesStatus,
  rejectReservationsBySeries,
  approveCancellationBySeries,
  rejectCancellationBySeries,
} from '@/lib/db';
import {
  sendBulkApprovalEmail,
  sendRejectionEmail,
  sendCancellationApprovedEmail,
  sendCancellationRejectedEmail,
} from '@/lib/email';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { LIMITS } from '@/lib/constants';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  const seriesId = String(params.id || '').trim();
  if (!seriesId) {
    return NextResponse.json({ error: '잘못된 시리즈 번호입니다.' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const reason = body?.reason?.trim();

    if (action === 'approve') {
      const approvedReservations = await approveReservationsBySeries(seriesId);
      await setReservationSeriesStatus(seriesId, 'approved');

      sendBulkApprovalEmail(approvedReservations).catch((e) =>
        console.error('[email] 시리즈 승인 이메일 발송 실패:', e)
      );

      return NextResponse.json({ approved: approvedReservations.length });
    }

    if (action === 'reject') {
      if (!reason) {
        return NextResponse.json({ error: '거절 사유를 입력해주세요.' }, { status: 400 });
      }
      if (reason.length > LIMITS.reason) {
        return NextResponse.json({ error: `거절 사유는 ${LIMITS.reason}자 이하여야 합니다.` }, { status: 400 });
      }

      const rejectedReservations = await rejectReservationsBySeries(seriesId, reason);
      for (const r of rejectedReservations) {
        sendRejectionEmail(r, reason).catch((e) =>
          console.error('[email] 시리즈 거절 이메일 발송 실패:', e)
        );
      }
      return NextResponse.json({ rejected: rejectedReservations.length });
    }

    if (action === 'approve_cancellation') {
      const cancelled = await approveCancellationBySeries(seriesId);
      for (const r of cancelled) {
        sendCancellationApprovedEmail(r).catch((e) =>
          console.error('[email] 시리즈 취소 승인 이메일 발송 실패:', e)
        );
      }
      return NextResponse.json({ approved: cancelled.length });
    }

    if (action === 'reject_cancellation') {
      const rejectReason = reason ?? undefined;
      if (rejectReason && rejectReason.length > LIMITS.reason) {
        return NextResponse.json({ error: `거절 사유는 ${LIMITS.reason}자 이하여야 합니다.` }, { status: 400 });
      }
      const reverted = await rejectCancellationBySeries(seriesId, rejectReason || null);
      for (const r of reverted) {
        sendCancellationRejectedEmail(r, rejectReason).catch((e) =>
          console.error('[email] 시리즈 취소 거절 이메일 발송 실패:', e)
        );
      }
      return NextResponse.json({ rejected: reverted.length });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

