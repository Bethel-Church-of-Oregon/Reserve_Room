import { NextResponse } from 'next/server';
import { getRooms } from '@/lib/db';

export function GET() {
  try {
    const rooms = getRooms();
    return NextResponse.json(rooms);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
