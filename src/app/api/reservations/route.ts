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

// Date helpers (timezone-safe: uses local date components only)
function dateAdd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthAdd(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function generateOccurrences(
  startTime: string,      // '2024-03-10T09:00:00'
  endTime: string,        // '2024-03-10T10:00:00'
  recurring: string,      // 'daily' | 'weekly' | 'monthly'
  recurringUntil: string  // '2024-06-10'
): Array<{ start_time: string; end_time: string }> {
  const startTimeSuffix = startTime.slice(10); // 'T09:00:00'
  const endTimeSuffix = endTime.slice(10);     // 'T10:00:00'

  const results: Array<{ start_time: string; end_time: string }> = [];
  let currentDate = startTime.slice(0, 10); // '2024-03-10'
  const MAX_OCCURRENCES = 200;

  while (currentDate <= recurringUntil && results.length < MAX_OCCURRENCES) {
    results.push({
      start_time: currentDate + startTimeSuffix,
      end_time: currentDate + endTimeSuffix,
    });

    if (recurring === 'daily') {
      currentDate = dateAdd(currentDate, 1);
    } else if (recurring === 'weekly') {
      currentDate = dateAdd(currentDate, 7);
    } else if (recurring === 'monthly') {
      currentDate = monthAdd(currentDate, 1);
    } else {
      break;
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, room_id, start_time, end_time, person_in_charge, email, notes, recurring, recurring_until } = body;

    // Validate required fields
    if (!title || !room_id || !start_time || !end_time || !person_in_charge || !email) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return NextResponse.json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' }, { status: 400 });
    }

    // Recurring reservation
    if (recurring && recurring !== 'none' && recurring_until) {
      const occurrences = generateOccurrences(start_time, end_time, recurring, recurring_until);

      let created = 0;
      const conflictDates: string[] = [];

      for (const occ of occurrences) {
        const hasConflict = await checkConflict(room_id, occ.start_time, occ.end_time);
        if (hasConflict) {
          conflictDates.push(occ.start_time.slice(0, 10));
        } else {
          await createReservation({ title, room_id, start_time: occ.start_time, end_time: occ.end_time, person_in_charge, email, notes });
          created++;
        }
      }

      if (created === 0) {
        return NextResponse.json(
          { error: 'conflict', message: '선택한 기간의 모든 날짜에 이미 예약이 있습니다.', conflictDates },
          { status: 409 }
        );
      }

      return NextResponse.json({ created, conflicts: conflictDates.length, conflictDates }, { status: 201 });
    }

    // Single reservation
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
