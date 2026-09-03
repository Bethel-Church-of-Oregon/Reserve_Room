import { NextRequest, NextResponse } from 'next/server';
import { deleteReservation } from '@/lib/db';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { applyReservationEdit } from '@/lib/editReservation';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: '잘못된 예약 번호입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const { action, reason } = body;

    if (action === 'edit') {
      // Admin edits skip the requester-email check and may correct past events.
      const result = await applyReservationEdit(id, body, { requesterEmail: null, allowPast: true });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
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
    const id = parseInt(params.id, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: '잘못된 예약 번호입니다.' }, { status: 400 });
    }

    const ok = await deleteReservation(id);
    if (!ok) return NextResponse.json({ error: '삭제할 수 없습니다. 승인된 예약만 삭제 가능합니다.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
