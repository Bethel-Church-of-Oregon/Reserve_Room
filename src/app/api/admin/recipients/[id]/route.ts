import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { deleteNotificationRecipient } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  try {
    const ok = await deleteNotificationRecipient(id);
    if (!ok) return NextResponse.json({ error: '해당 수신자를 찾을 수 없습니다.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
