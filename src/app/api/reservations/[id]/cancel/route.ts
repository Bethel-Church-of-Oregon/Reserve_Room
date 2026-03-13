import { NextRequest, NextResponse } from 'next/server';
import { requestCancellation } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: '잘못된 예약 번호입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const reason = body?.reason?.trim();
    if (!reason) {
      return NextResponse.json({ error: '취소 사유를 입력해주세요.' }, { status: 400 });
    }

    const ok = await requestCancellation(id, reason);
    if (!ok) {
      return NextResponse.json(
        { error: '취소 신청할 수 없습니다. 대기 중이거나 확정된 예약만 취소 신청이 가능합니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
