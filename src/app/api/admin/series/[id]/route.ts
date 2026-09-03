import { NextRequest, NextResponse } from 'next/server';
import {
  setReservationSeriesStatus,
  requestCancellationSeries,
  getSeriesOccurrenceFrom,
} from '@/lib/db';
import { sendReservationCancelledSeriesEmail } from '@/lib/email';
import { sendSmsNotifications, buildCancellationSmsMessage } from '@/lib/sms';
import { sendTelegramNotification, buildCancellationTelegramMessage } from '@/lib/telegram';
import { pacificDateKey } from '@/lib/date';
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

    // Recurring series can only be created by an administrator, but until now
    // cancelling one was only possible from the public calendar, which asks for
    // the reserver's email. An administrator had no way to clear a series they
    // had created themselves — short of deleting each occurrence in turn — and
    // no way at all to clear a member's.
    if (action === 'cancel') {
      if (reason && reason.length > LIMITS.reason) {
        return NextResponse.json({ error: `취소 사유는 ${LIMITS.reason}자 이하여야 합니다.` }, { status: 400 });
      }

      // From today onward. Past occurrences stay as the record of what was
      // actually used, matching the public "this and all future" wording.
      const from = `${pacificDateKey()}T00:00:00`;

      const target = await getSeriesOccurrenceFrom(seriesId, from);
      if (!target) {
        return NextResponse.json(
          { error: '취소할 예약이 없습니다. 이미 취소되었거나 지난 일정만 남아 있습니다.' },
          { status: 400 }
        );
      }

      const cancelReason = reason || '관리자 취소';
      const cancelled = await requestCancellationSeries(seriesId, from, cancelReason);
      await setReservationSeriesStatus(seriesId, 'cancelled');

      // One notification for the whole series, awaited before responding.
      await Promise.all([
        sendReservationCancelledSeriesEmail({
          title: target.title,
          room_name: target.room_name,
          from_start_time: target.start_time,
          person_in_charge: target.person_in_charge,
          email: target.email,
          cancelled_count: cancelled,
          cancellation_reason: cancelReason,
        }).catch((e) => console.error('[email] 시리즈 취소 메일 발송 실패:', e)),

        sendSmsNotifications(buildCancellationSmsMessage({
          title: target.title,
          room_name: target.room_name,
          start_time: target.start_time,
          end_time: target.end_time,
          person_in_charge: target.person_in_charge,
        })).catch((e) => console.error('[sms] 발송 실패:', e)),

        sendTelegramNotification(buildCancellationTelegramMessage({
          title: target.title,
          room_name: target.room_name,
          start_time: target.start_time,
          end_time: target.end_time,
          person_in_charge: target.person_in_charge,
          cancellation_reason: cancelReason,
        })).catch((e) => console.error('[telegram] 발송 실패:', e)),
      ]);

      return NextResponse.json({ cancelled });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

