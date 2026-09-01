import { NextRequest, NextResponse } from 'next/server';
import { checkEditLimit } from '@/lib/ratelimit';
import { applyReservationEdit } from '@/lib/editReservation';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { limited } = await checkEditLimit(req);
    if (limited) {
      return NextResponse.json(
        { error: '변경 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: '잘못된 예약 번호입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const email = body?.email?.trim();
    if (!email) {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 });
    }

    const result = await applyReservationEdit(id, body, { requesterEmail: email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
