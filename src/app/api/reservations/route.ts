import { NextRequest, NextResponse } from 'next/server';
import { addMonths, addDays, format } from 'date-fns';
import { getReservations, createReservation, createReservationSeries, checkConflict, getRooms, getConflictingReservationsForRange, createReservationsBulk, getReservationAccessCode } from '@/lib/db';
import { checkReservationLimit } from '@/lib/ratelimit';
import { LIMITS } from '@/lib/constants';
import { sendReservationCreatedEmail, sendReservationCreatedBulkEmail } from '@/lib/email';
import { sendSmsNotifications, buildReservationSmsMessage } from '@/lib/sms';
import { sendTelegramNotification, buildReservationTelegramMessage } from '@/lib/telegram';
import { pacificTodayDate } from '@/lib/date';
import { cookies } from 'next/headers';
import { verifyAdminSession } from '@/lib/auth';

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

// Date helpers (timezone-safe: uses date-fns for correct month boundaries, e.g. Jan 31 + 1 month = Feb 28/29)
function dateAdd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = addDays(new Date(y, m - 1, d), days);
  return format(date, 'yyyy-MM-dd');
}

function monthAdd(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = addMonths(new Date(y, m - 1, d), months);
  return format(date, 'yyyy-MM-dd');
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
  const MAX_OCCURRENCES = 500;

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
    const { limited } = await checkReservationLimit(req);
    if (limited) {
      return NextResponse.json(
        { error: '예약 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { title, room_id, start_time, end_time, person_in_charge, email, notes, recurring, recurring_until } = body;

    // Admin status comes from the signed session cookie, never from the URL. The
    // `?admin=true` query parameter is only a client-side hint about which form
    // fields to show — trusting it here let anyone lift the one-month limit,
    // create recurring series, and suppress the administrator notifications.
    const isAdmin = verifyAdminSession(cookies().get('admin_auth')?.value);

    // Shared reservation code, checked before anything else touches the database
    // and skipped for administrators, who are already authenticated. With no code
    // configured the gate is simply off, so the app works without one.
    if (!isAdmin) {
      const accessCode = await getReservationAccessCode();
      if (accessCode) {
        const supplied = String(body?.access_code ?? '').trim();
        if (supplied.toLowerCase() !== accessCode.toLowerCase()) {
          return NextResponse.json(
            { error: 'code', message: '예약 코드가 올바르지 않습니다. 주보를 확인하시거나 교회 사무실로 문의해 주세요.' },
            { status: 403 }
          );
        }
      }
    }

    // Validate required fields
    if (!title || !room_id || !start_time || !end_time || !person_in_charge || !email) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 });
    }

    const titleStr = String(title).trim();
    const personStr = String(person_in_charge).trim();
    const emailStr = String(email).trim();
    const notesStr = notes != null ? String(notes).trim() : '';

    if (titleStr.length > LIMITS.title) {
      return NextResponse.json({ error: `제목은 ${LIMITS.title}자 이하여야 합니다.` }, { status: 400 });
    }
    if (personStr.length > LIMITS.person_in_charge) {
      return NextResponse.json({ error: `담당자명은 ${LIMITS.person_in_charge}자 이하여야 합니다.` }, { status: 400 });
    }
    if (emailStr.length > LIMITS.email) {
      return NextResponse.json({ error: `이메일은 ${LIMITS.email}자 이하여야 합니다.` }, { status: 400 });
    }
    if (notesStr.length > LIMITS.notes) {
      return NextResponse.json({ error: `노트는 ${LIMITS.notes}자 이하여야 합니다.` }, { status: 400 });
    }

    const roomIdNum = Number(room_id);
    if (!Number.isInteger(roomIdNum) || roomIdNum < 1) {
      return NextResponse.json({ error: '올바른 장소를 선택해 주세요.' }, { status: 400 });
    }
    // Regular members are validated against visible rooms only, so hiding a room
    // in the picker cannot be undone by posting its id directly.
    const rooms = await getRooms(isAdmin);
    if (!rooms.some((r) => r.id === roomIdNum)) {
      return NextResponse.json({ error: '선택할 수 없는 장소입니다.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return NextResponse.json({ error: '종료 시간은 시작 시간보다 늦어야 합니다.' }, { status: 400 });
    }

    // 일반 사용자는 오늘로부터 1달 이내만 예약 가능 (서부시간 기준 날짜 문자열 비교)
    if (!isAdmin) {
      const maxDateKey = format(addMonths(pacificTodayDate(), 1), 'yyyy-MM-dd');
      if (String(start_time).slice(0, 10) > maxDateKey) {
        return NextResponse.json({ error: '예약은 오늘로부터 1달 이내만 신청할 수 있습니다.' }, { status: 400 });
      }
    }

    // Recurring reservation — admin only. This was previously hidden in the UI but
    // not enforced here, so a single request could insert up to MAX_OCCURRENCES rows.
    if (recurring && recurring !== 'none' && recurring_until) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: '반복 예약은 관리자만 신청할 수 있습니다.' },
          { status: 403 }
        );
      }

      const seriesId = crypto.randomUUID();
      await createReservationSeries({
        id: seriesId,
        title: titleStr,
        room_id: roomIdNum,
        person_in_charge: personStr,
        email: emailStr,
        notes: notesStr || undefined,
        recurring,
        recurring_until,
      });

      const occurrences = generateOccurrences(start_time, end_time, recurring, recurring_until);

      // Fetch all existing conflicts in the full date range with a single query
      const minStart = occurrences[0].start_time;
      const maxEnd = occurrences[occurrences.length - 1].end_time;
      const existingConflicts = await getConflictingReservationsForRange(roomIdNum, minStart, maxEnd);

      // Check each occurrence against in-memory conflict list
      const conflictDates: string[] = [];
      const toInsert: Array<{ start_time: string; end_time: string; series_index: number }> = [];
      let seriesIndex = 0;

      for (const occ of occurrences) {
        const hasConflict = existingConflicts.some(
          (c) => c.start_time < occ.end_time && c.end_time > occ.start_time
        );
        if (hasConflict) {
          conflictDates.push(occ.start_time.slice(0, 10));
        } else {
          toInsert.push({ start_time: occ.start_time, end_time: occ.end_time, series_index: seriesIndex });
          seriesIndex++;
        }
      }

      // Bulk INSERT all non-conflicting occurrences in a single query
      if (toInsert.length > 0) {
        await createReservationsBulk({
          series_id: seriesId,
          title: titleStr,
          room_id: roomIdNum,
          person_in_charge: personStr,
          email: emailStr,
          notes: notesStr || undefined,
          occurrences: toInsert,
        });
      }
      const created = toInsert.length;

      if (created === 0) {
        return NextResponse.json(
          { error: 'conflict', message: '선택한 기간의 모든 날짜에 이미 예약이 있습니다.', conflictDates },
          { status: 409 }
        );
      }

      const roomName = rooms.find((r) => r.id === roomIdNum)?.name ?? '';
      await sendReservationCreatedBulkEmail({
        title: titleStr,
        room_name: roomName,
        person_in_charge: personStr,
        email: emailStr,
        occurrences: toInsert,
        created,
        notes: notesStr || undefined,
      }).catch((e) => console.error('[email] 반복예약 확인 메일 발송 실패:', e));

      return NextResponse.json(
        { created, conflicts: conflictDates.length, conflictDates, seriesId },
        { status: 201 }
      );
    }

    // Single reservation
    const hasConflict = await checkConflict(roomIdNum, start_time, end_time);
    if (hasConflict) {
      return NextResponse.json(
        { error: 'conflict', message: '해당 시간에 이미 예약이 있습니다.' },
        { status: 409 }
      );
    }

    const reservation = await createReservation({ title: titleStr, room_id: roomIdNum, start_time, end_time, person_in_charge: personStr, email: emailStr, notes: notesStr || undefined });

    const roomName = rooms.find((r) => r.id === roomIdNum)?.name ?? '';

    // Awaited (in parallel) before responding: serverless freezes the instance
    // once the response is sent, which would kill an un-awaited send mid-flight.
    await Promise.all([
      sendReservationCreatedEmail({
        title: titleStr,
        room_name: roomName,
        start_time,
        end_time,
        person_in_charge: personStr,
        email: emailStr,
        notes: notesStr || undefined,
      }).catch((e) => console.error('[email] 예약 확인 메일 발송 실패:', e)),

      // 담당자 알림: 일반 사용자 예약만 (관리자 예약 제외)
      isAdmin
        ? Promise.resolve()
        : sendSmsNotifications(buildReservationSmsMessage({
            title: titleStr,
            room_name: roomName,
            start_time,
            end_time,
            person_in_charge: personStr,
          })).catch((e) => console.error('[sms] 발송 실패:', e)),

      isAdmin
        ? Promise.resolve()
        : sendTelegramNotification(buildReservationTelegramMessage({
            title: titleStr,
            room_name: roomName,
            start_time,
            end_time,
            person_in_charge: personStr,
            notes: notesStr || undefined,
          })).catch((e) => console.error('[telegram] 발송 실패:', e)),
    ]);

    return NextResponse.json(reservation, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
