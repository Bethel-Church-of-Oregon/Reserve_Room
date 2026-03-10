import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'bethel2024';

    if (password !== adminPassword) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const cookieStore = cookies();
    cookieStore.set('admin_auth', 'true', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
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
  const isAuth = cookieStore.get('admin_auth')?.value === 'true';
  return NextResponse.json({ authenticated: isAuth });
}
