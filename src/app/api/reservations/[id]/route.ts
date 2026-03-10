import { NextRequest, NextResponse } from 'next/server';
import { approveReservation, rejectReservation, deleteReservation } from '@/lib/db';
import { cookies } from 'next/headers';

function isAdminAuthed(): boolean {
  const cookieStore = cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const body = await req.json();
    const { action, reason } = body;

    if (action === 'approve') {
      const ok = approveReservation(id);
      if (!ok) return NextResponse.json({ error: '승인할 수 없습니다.' }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'reject') {
      if (!reason?.trim()) {
        return NextResponse.json({ error: '거절 사유를 입력해주세요.' }, { status: 400 });
      }
      const ok = rejectReservation(id, reason);
      if (!ok) return NextResponse.json({ error: '거절할 수 없습니다.' }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const ok = deleteReservation(id);
    if (!ok) return NextResponse.json({ error: '삭제할 수 없습니다. 승인된 예약만 삭제 가능합니다.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
