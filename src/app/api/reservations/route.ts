import { NextRequest, NextResponse } from 'next/server';
import { getReservations, createReservation, checkConflict } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const reservations = await getReservations(from, to);
    return NextResponse.json(reservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, room_id, start_time, end_time, person_in_charge, email, notes } = body;

    // Validate required fields
    if (!title || !room_id || !start_time || !end_time || !person_in_charge || !email) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return NextResponse.json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' }, { status: 400 });
    }

    // Check for conflicts
    const hasConflict = await checkConflict(room_id, start_time, end_time);
    if (hasConflict) {
      return NextResponse.json(
        { error: 'conflict', message: '해당 시간에 이미 예약이 있습니다.' },
        { status: 409 }
      );
    }

    const reservation = await createReservation({ title, room_id, start_time, end_time, person_in_charge, email, notes });
    return NextResponse.json(reservation, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
