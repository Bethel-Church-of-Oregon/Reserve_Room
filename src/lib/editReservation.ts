import {
  getReservationById,
  updateReservation,
  checkConflict,
  isOverlapViolation,
} from '@/lib/db';
import { LIMITS } from '@/lib/constants';
import { pacificDateKey, normalizeDateTime } from '@/lib/date';
import { sendReservationUpdatedEmail } from '@/lib/email';
import { sendSmsNotifications, buildUpdateSmsMessage } from '@/lib/sms';
import { sendTelegramNotification, buildUpdateTelegramMessage } from '@/lib/telegram';

export type EditResult = { ok: true } | { ok: false; error: string; status: number };

const fail = (error: string, status: number): EditResult => ({ ok: false, error, status });

/**
 * Shared edit path for both the requester-facing route and the admin route.
 *
 * Room and date are never editable — only the time-of-day, title, contact and
 * notes may move. Holding room and date fixed is what keeps this cheap: a single
 * `checkConflict` with the row excluded is the whole conflict story, and no
 * calendar range, month limit or series regeneration is affected.
 *
 * @param requesterEmail the email to verify against the reservation, or `null`
 *   for an admin edit that skips the ownership check.
 * @param allowPast admins may correct records for events that already happened.
 */
export async function applyReservationEdit(
  id: number,
  body: Record<string, unknown>,
  { requesterEmail, allowPast = false }: { requesterEmail: string | null; allowPast?: boolean }
): Promise<EditResult> {
  const reservation = await getReservationById(id);
  if (!reservation) return fail('예약 정보를 찾을 수 없습니다.', 404);

  if (requesterEmail !== null) {
    if (reservation.email.toLowerCase() !== requesterEmail.toLowerCase()) {
      return fail('이메일이 일치하지 않습니다.', 403);
    }

    // Recurring bookings are administrator-only in both directions: only an
    // administrator creates a series, so only an administrator changes or clears
    // one. Guarded here rather than in the route because this is where the
    // requester-versus-administrator distinction already lives, and the
    // reservation has been loaded once.
    if (reservation.series_id) {
      return fail(
        '반복 예약은 이 화면에서 변경할 수 없습니다. 교회 사무실이나 장소예약 담당자에게 문의해 주세요.',
        403
      );
    }
  }

  if (reservation.status !== 'approved') {
    return fail('확정된 예약만 변경할 수 있습니다.', 400);
  }

  const originalDate = reservation.start_time.slice(0, 10);
  if (!allowPast && originalDate < pacificDateKey()) {
    return fail('지난 예약은 변경할 수 없습니다.', 400);
  }

  const title = String(body?.title ?? '').trim();
  const person_in_charge = String(body?.person_in_charge ?? '').trim();
  const notesRaw = body?.notes != null ? String(body.notes).trim() : '';
  const startRaw = String(body?.start_time ?? '').trim();
  const endRaw = String(body?.end_time ?? '').trim();

  if (!title) return fail('제목을 입력해주세요.', 400);
  if (title.length > LIMITS.title) return fail(`제목은 ${LIMITS.title}자 이하여야 합니다.`, 400);
  if (!person_in_charge) return fail('담당자를 입력해주세요.', 400);
  if (person_in_charge.length > LIMITS.person_in_charge) {
    return fail(`담당자명은 ${LIMITS.person_in_charge}자 이하여야 합니다.`, 400);
  }
  if (notesRaw.length > LIMITS.notes) return fail(`노트는 ${LIMITS.notes}자 이하여야 합니다.`, 400);

  // Validated and normalized by the same helper the create route uses, so both
  // paths reject the same impossible instants and write the same 19-character
  // format the "nothing changed" and previous-time comparisons rely on.
  const start_time = normalizeDateTime(startRaw);
  const end_time = normalizeDateTime(endRaw);
  if (!start_time || !end_time) {
    return fail('시간 형식이 올바르지 않습니다.', 400);
  }

  if (start_time.slice(0, 10) !== originalDate || end_time.slice(0, 10) !== originalDate) {
    return fail(
      '같은 날짜 안에서만 시간을 변경할 수 있습니다. 날짜나 장소를 바꾸시려면 취소 후 다시 예약해 주세요.',
      400
    );
  }
  if (start_time >= end_time) {
    return fail('종료 시간은 시작 시간보다 늦어야 합니다.', 400);
  }

  if (await checkConflict(reservation.room_id, start_time, end_time, id)) {
    return fail('변경하려는 시간에 이미 해당 장소 예약이 있습니다. 다른 시간을 선택해주세요.', 409);
  }

  const notes = notesRaw || null;
  const nothingChanged =
    title === reservation.title &&
    person_in_charge === reservation.person_in_charge &&
    (notes ?? '') === (reservation.notes ?? '') &&
    start_time === reservation.start_time &&
    end_time === reservation.end_time;
  if (nothingChanged) return fail('변경된 내용이 없습니다.', 400);

  let updated: boolean;
  try {
    updated = await updateReservation(id, { title, start_time, end_time, person_in_charge, notes });
  } catch (e) {
    // Someone booked the slot between checkConflict above and this update.
    if (isOverlapViolation(e)) {
      return fail('변경하려는 시간에 이미 해당 장소 예약이 있습니다. 다른 시간을 선택해주세요.', 409);
    }
    throw e;
  }
  if (!updated) return fail('변경할 수 없습니다.', 400);

  // Awaited before returning: serverless kills un-awaited sends when the route responds.
  await Promise.all([
    sendReservationUpdatedEmail({
      title,
      room_name: reservation.room_name,
      start_time,
      end_time,
      person_in_charge,
      email: reservation.email,
      notes,
      previous_title: reservation.title,
      previous_start_time: reservation.start_time,
      previous_end_time: reservation.end_time,
      previous_person_in_charge: reservation.person_in_charge,
    }).catch((e) => console.error('[email] 변경 이메일 발송 실패:', e)),

    sendSmsNotifications(buildUpdateSmsMessage({
      title,
      room_name: reservation.room_name,
      start_time,
      end_time,
      person_in_charge,
      previous_start_time: reservation.start_time,
      previous_end_time: reservation.end_time,
    })).catch((e) => console.error('[sms] 발송 실패:', e)),

    sendTelegramNotification(buildUpdateTelegramMessage({
      title,
      room_name: reservation.room_name,
      start_time,
      end_time,
      person_in_charge,
      previous_start_time: reservation.start_time,
      previous_end_time: reservation.end_time,
      notes,
    })).catch((e) => console.error('[telegram] 발송 실패:', e)),
  ]);

  return { ok: true };
}
