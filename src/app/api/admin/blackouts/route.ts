import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';
import { createBlackout, countReservationsInBlackout, getRooms } from '@/lib/db';
import { BLACKOUT_RECURRING, type BlackoutRecurring } from '@/lib/blackout';
import { DATE_RE } from '@/lib/date';
import { LIMITS } from '@/lib/constants';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: NextRequest) {
  if (!verifyAdminSession(cookies().get('admin_auth')?.value)) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const label = String(body?.label ?? '').trim();
    const recurring = String(body?.recurring ?? '') as BlackoutRecurring;
    const start_time = String(body?.start_time ?? '').trim();
    const end_time = String(body?.end_time ?? '').trim();
    const date_from = body?.date_from ? String(body.date_from).trim() : null;
    const date_to = body?.date_to ? String(body.date_to).trim() : null;
    const roomRaw = body?.room_id;
    // null means every room, so an absent value and a present null differ.
    const room_id = roomRaw === null || roomRaw === undefined || roomRaw === '' ? null : Number(roomRaw);
    const weekdayRaw = body?.weekday;
    const weekday = weekdayRaw === null || weekdayRaw === undefined || weekdayRaw === '' ? null : Number(weekdayRaw);

    if (!label) return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
    if (label.length > LIMITS.title) {
      return NextResponse.json({ error: `이름은 ${LIMITS.title}자 이하여야 합니다.` }, { status: 400 });
    }
    if (!BLACKOUT_RECURRING.includes(recurring)) {
      return NextResponse.json({ error: '반복 주기를 선택해주세요.' }, { status: 400 });
    }
    if (recurring === 'weekly' && !(Number.isInteger(weekday) && weekday! >= 0 && weekday! <= 6)) {
      return NextResponse.json({ error: '요일을 선택해주세요.' }, { status: 400 });
    }
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
      return NextResponse.json({ error: '시간 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    if (start_time >= end_time) {
      return NextResponse.json({ error: '종료 시간이 시작 시간보다 늦어야 합니다.' }, { status: 400 });
    }
    if ((date_from && !DATE_RE.test(date_from)) || (date_to && !DATE_RE.test(date_to))) {
      return NextResponse.json({ error: '유효기간 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    if (date_from && date_to && date_from > date_to) {
      return NextResponse.json({ error: '유효기간 종료일이 시작일보다 늦어야 합니다.' }, { status: 400 });
    }
    if (room_id !== null) {
      // Retired rooms included: an administrator may well need to protect one.
      const rooms = await getRooms(true);
      if (!rooms.some((r) => r.id === room_id)) {
        return NextResponse.json({ error: '존재하지 않는 장소입니다.' }, { status: 400 });
      }
    }

    // `weekday` is stored as null for a daily rule so the column never carries a
    // value the recurrence does not use.
    const rule = {
      label,
      room_id,
      recurring,
      weekday: recurring === 'weekly' ? weekday : null,
      start_time,
      end_time,
      date_from,
      date_to,
    };

    // Counted before the insert so the number cannot include anything this
    // request caused, and reported back: a rule saved over hundreds of existing
    // bookings protects nothing, and the administrator has to be told.
    const existingCount = await countReservationsInBlackout(rule);
    const blackout = await createBlackout(rule);
    return NextResponse.json({ blackout, existingCount }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
