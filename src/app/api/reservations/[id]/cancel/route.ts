import { NextRequest, NextResponse } from 'next/server';
import { getReservationById, requestCancellation, requestCancellationSeries, setReservationSeriesStatus } from '@/lib/db';
import { checkCancelLimit } from '@/lib/ratelimit';
import { LIMITS } from '@/lib/constants';

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
    const reason = body?.reason?.trim();
    const scope = body?.scope === 'series' ? 'series' : 'one';
    if (!reason) {
      return NextResponse.json({ error: '취소 사유를 입력해주세요.' }, { status: 400 });
    }
    if (reason.length > LIMITS.reason) {
      return NextResponse.json({ error: `취소 사유는 ${LIMITS.reason}자 이하여야 합니다.` }, { status: 400 });
    }

    if (scope === 'series') {
      const reservation = await getReservationById(id);
      if (!reservation) {
        return NextResponse.json({ error: '예약 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      const seriesId = reservation?.series_id ?? null;
      if (!seriesId) {
        return NextResponse.json({ error: '반복 예약이 아닙니다.' }, { status: 400 });
      }

      const requested = await requestCancellationSeries(seriesId, reservation.start_time, reason);
      if (requested === 0) {
        return NextResponse.json(
          { error: '취소 신청할 수 없습니다. 대기 중이거나 확정된 예약만 취소 신청이 가능합니다.' },
          { status: 400 }
        );
      }

      // Mark series as cancelled (calendar visibility is driven by instance rows)
      await setReservationSeriesStatus(seriesId, 'cancelled');
    } else {
      const ok = await requestCancellation(id, reason);
      if (!ok) {
        return NextResponse.json(
          { error: '취소 신청할 수 없습니다. 대기 중이거나 확정된 예약만 취소 신청이 가능합니다.' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
