import { NextRequest, NextResponse } from 'next/server';
import { getReservationById, requestCancellation } from '@/lib/db';
import { checkCancelLimit, checkCancelEmailLimit } from '@/lib/ratelimit';
import { LIMITS } from '@/lib/constants';
import { sendReservationCancelledEmail } from '@/lib/email';
import { sendSmsNotifications, buildCancellationSmsMessage } from '@/lib/sms';
import { sendTelegramNotification, buildCancellationTelegramMessage } from '@/lib/telegram';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { limited } = await checkCancelLimit(req);
    if (limited) {
      return NextResponse.json(
        { error: '취소 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: '잘못된 예약 번호입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const email = body?.email?.trim();
    const reason = body?.reason?.trim();
    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json({ error: '예약 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (reservation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: '이메일이 일치하지 않습니다.' }, { status: 403 });
    }

    // One date out of a recurring series can be cancelled here; the series as a
    // whole cannot. There is no `scope` parameter to ask for more — it was
    // removed, so this route is structurally single-occurrence. Cancelling a
    // whole series lives in `PATCH /api/admin/series/[id]`, behind the admin
    // session, which is also where creating one lives.
    //
    // That split is deliberate. Skipping one week of a standing meeting is an
    // everyday request and routing it through a coordinator makes the
    // coordinator the bottleneck — and a booking nobody can conveniently
    // release is a room that sits empty while showing as taken. Losing the
    // whole series is a different order of mistake, so it stays behind the
    // session.
    //
    // The residual risk is that the reserver's email is the only credential and
    // every occurrence shares it, so someone holding it could still cancel 52
    // dates one at a time. That is what the notification below is for: the
    // coordinator hears about the first one, not the fifty-second.
    const seriesOccurrence = Boolean(reservation.series_id);

    const ok = await requestCancellation(id, reason);
    if (!ok) {
      return NextResponse.json(
        { error: '취소 신청할 수 없습니다. 확정된 예약만 취소할 수 있습니다.' },
        { status: 400 }
      );
    }

    await Promise.all([
      sendReservationCancelledEmail({
        title: reservation.title,
        room_name: reservation.room_name,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        person_in_charge: reservation.person_in_charge,
        email: reservation.email,
        cancellation_reason: reason,
        series_occurrence: seriesOccurrence,
      }).catch((e) => console.error('[email] 취소 메일 발송 실패:', e)),

      sendSmsNotifications(buildCancellationSmsMessage({
        title: reservation.title,
        room_name: reservation.room_name,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        person_in_charge: reservation.person_in_charge,
        series_occurrence: seriesOccurrence,
      })).catch((e) => console.error('[sms] 발송 실패:', e)),

      sendTelegramNotification(buildCancellationTelegramMessage({
        title: reservation.title,
        room_name: reservation.room_name,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        person_in_charge: reservation.person_in_charge,
        cancellation_reason: reason,
        series_occurrence: seriesOccurrence,
      })).catch((e) => console.error('[telegram] 발송 실패:', e)),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
