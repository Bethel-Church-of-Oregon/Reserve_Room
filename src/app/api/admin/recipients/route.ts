import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { getNotificationRecipients, createNotificationRecipient } from '@/lib/db';
import { toE164 } from '@/lib/sms';

function isAdmin() {
  return verifyAdminSession(cookies().get('admin_auth')?.value);
}

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  try {
    const recipients = await getNotificationRecipients();
    return NextResponse.json(recipients);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin()) return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  try {
    const { name, phone } = await req.json();
    const nameStr = String(name ?? '').trim();
    const phoneStr = String(phone ?? '').replace(/\D/g, '');

    if (!nameStr) return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
    if (!phoneStr || phoneStr.length < 10) return NextResponse.json({ error: '올바른 전화번호를 입력해주세요.' }, { status: 400 });
    if (!toE164(phoneStr)) return NextResponse.json({ error: '올바른 전화번호를 입력해주세요. (미국 10자리)' }, { status: 400 });

    const recipient = await createNotificationRecipient({ name: nameStr, phone: phoneStr });
    return NextResponse.json(recipient, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
