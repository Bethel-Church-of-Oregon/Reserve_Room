import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminSession, verifyAdminSession } from '@/lib/auth';
import { checkAdminLoginLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const { limited } = await checkAdminLoginLimit(req);
    if (limited) {
      return NextResponse.json(
        { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error('[admin] ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.');
      return NextResponse.json(
        { error: '관리자 로그인이 설정되지 않았습니다. 서버 관리자에게 문의하세요.' },
        { status: 503 }
      );
    }

    const { password } = await req.json();
    if (password !== adminPassword) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const cookieStore = cookies();
    cookieStore.set('admin_auth', createAdminSession(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // No maxAge = session cookie: expires when browser is closed
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = cookies();
  cookieStore.delete('admin_auth');
  return NextResponse.json({ success: true });
}

export async function GET() {
  const cookieStore = cookies();
  const isAuth = verifyAdminSession(cookieStore.get('admin_auth')?.value);
  return NextResponse.json({ authenticated: isAuth });
}
