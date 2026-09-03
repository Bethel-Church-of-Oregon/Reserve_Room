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

    // A recurring booking is never cancelled from here. Only an administrator can
    // create one, and this route used to let anyone holding the reserver's email
    // cancel the whole series in a single request — 226 future occurrences of
    // 새가족 교육 went that way. Series cancellation now lives only in
    // `PATCH /api/admin/series/[id]`, behind the admin session.
    //
    // Enforced on the server, not just hidden in the UI: hiding alone is what
    // made the `?admin=true` hole possible.
    if (reservation.series_id) {
      return NextResponse.json(
        { error: '반복 예약은 이 화면에서 취소할 수 없습니다. 교회 사무실이나 장소예약 담당자에게 문의해 주세요.' },
        { status: 403 }
      );
    }

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
      }).catch((e) => console.error('[email] 취소 메일 발송 실패:', e)),

      sendSmsNotifications(buildCancellationSmsMessage({
        title: reservation.title,
        room_name: reservation.room_name,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        person_in_charge: reservation.person_in_charge,
      })).catch((e) => console.error('[sms] 발송 실패:', e)),

      sendTelegramNotification(buildCancellationTelegramMessage({
        title: reservation.title,
        room_name: reservation.room_name,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        person_in_charge: reservation.person_in_charge,
        cancellation_reason: reason,
      })).catch((e) => console.error('[telegram] 발송 실패:', e)),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
