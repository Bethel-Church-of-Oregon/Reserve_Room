import twilio from 'twilio';
import { getNotificationRecipients } from './db';

/**
 * SMS goes out through Twilio.
 *
 * The previous implementation used carrier email-to-SMS gateways (Gmail →
 * `number@vtext.com`). That was abandoned: carriers accept those messages with a
 * 250 OK and then silently discard them — no bounce, no error, nothing delivered.
 * AT&T and Sprint had already shut their gateways down entirely (no MX records).
 * Twilio reports delivery failures instead of hiding them, and handles Korean
 * text correctly.
 */

/** Returns null when Twilio is not configured, so SMS is skipped but reservations still work. */
function getTwilioClient(): { client: ReturnType<typeof twilio>; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) return null;
  return { client: twilio(sid, token), from };
}

/**
 * Normalize a stored phone number to E.164, which is the only format Twilio
 * accepts. Existing rows hold bare digits ('5039545830'); US numbers are assumed
 * when no country code is present.
 */
export function toE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function sendSmsNotifications(message: string): Promise<void> {
  const twilioConfig = getTwilioClient();
  if (!twilioConfig) {
    console.warn('[sms] Twilio 환경변수 미설정 — 문자 발송을 건너뜁니다.');
    return;
  }

  const recipients = await getNotificationRecipients();
  if (recipients.length === 0) return;

  const { client, from } = twilioConfig;

  // Must be awaited: on serverless the instance is frozen as soon as the route
  // responds, so an un-awaited send is killed mid-flight and nothing goes out.
  // Sends run in parallel and one failure never rejects the whole batch.
  await Promise.all(
    recipients.map(async (r) => {
      const to = toE164(r.phone);
      if (!to) {
        console.error('[sms] 전화번호 형식 오류, 건너뜀:', r.name, r.phone);
        return;
      }
      try {
        const res = await client.messages.create({ from, to, body: message });
        console.log(`[sms] 발송됨 ${r.name} ${to} sid=${res.sid} status=${res.status}`);
      } catch (e) {
        const err = e as { code?: number; message?: string };
        console.error(`[sms] 발송 실패 ${r.name} ${to}: [${err.code ?? '?'}] ${err.message ?? e}`);
      }
    })
  );
}

/**
 * One segment of Korean SMS. Korean is sent as UCS-2, which holds 70 characters
 * in a single segment — and only 67 per segment once a message spills into two,
 * where it also costs twice as much. Every message below is built to fit in one.
 */
const SMS_SEGMENT_LIMIT = 70;

/** 담당자 is free text — a name or a phone number — so it is capped as well. */
const PERSON_MAX = 10;

/** Under this a clipped title says nothing useful, so the edit diff is dropped instead. */
const TITLE_MIN = 6;

function clip(s: string, max: number): string {
  if (max <= 0) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Read straight out of the stored 'YYYY-MM-DDTHH:MM:SS' string rather than
 * parsing it into a Date, so the output cannot shift with the server's timezone.
 */
const hhmm = (iso: string) => iso.slice(11, 16);
const monthDay = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * Three lines: when, where, then what and who. The time leads because that is
 * what a recipient checks first, and the room gets its own line so it can be
 * scanned without reading the rest.
 *
 * The title is the only field that absorbs trimming. Room, date and time are
 * useless when truncated, and the full detail — including the complete title —
 * is already in the email and the Telegram message, neither of which has a
 * length limit.
 */
/**
 * Compose the three-line skeleton and spend whatever room is left on the title.
 * Returns the budget too, so a caller can decide whether an optional extra in
 * the head is worth the characters it costs.
 */
/**
 * `취소·반복` marks one date cancelled out of a recurring series. It costs two
 * characters of title budget, which is worth it: without it the coordinator
 * cannot tell a single cancellation from the loss of a standing meeting.
 */
type SmsTag = '예약' | '취소' | '변경' | '취소·반복';

function composeSms(
  tag: SmsTag,
  head: string,
  room: string,
  title: string,
  person: string
): { text: string; budget: number } {
  const p = clip(person.trim(), PERSON_MAX);
  const render = (t: string) => `[${tag}] ${head}\n${room}\n${p ? `${t} / ${p}` : t}`;
  const budget = SMS_SEGMENT_LIMIT - render('').length;
  return { text: render(clip(title.trim(), budget)), budget };
}

function buildSms(
  tag: SmsTag,
  data: {
    title: string;
    room_name: string;
    start_time: string;
    end_time: string;
    person_in_charge: string;
  },
  previous?: { start_time: string; end_time: string }
): string {
  const when = `${monthDay(data.start_time)} ${hhmm(data.start_time)}-${hhmm(data.end_time)}`;

  // A reservation can only be moved within its own day, so the previous time
  // never has to repeat the date. Show it only while the title still has room
  // left to say what the booking actually is.
  const moved =
    previous &&
    (previous.start_time !== data.start_time || previous.end_time !== data.end_time);
  if (moved) {
    const withDiff = composeSms(
      tag,
      `${when} (기존 ${hhmm(previous!.start_time)}-${hhmm(previous!.end_time)})`,
      data.room_name,
      data.title,
      data.person_in_charge
    );
    if (withDiff.budget >= TITLE_MIN) return withDiff.text;
  }

  return composeSms(tag, when, data.room_name, data.title, data.person_in_charge).text;
}

export function buildReservationSmsMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
}): string {
  return buildSms('예약', data);
}

export function buildCancellationSmsMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  /** One date out of a recurring series, rather than a standalone booking. */
  series_occurrence?: boolean;
}): string {
  return buildSms(data.series_occurrence ? '취소·반복' : '취소', data);
}

export function buildUpdateSmsMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  previous_start_time: string;
  previous_end_time: string;
}): string {
  return buildSms('변경', data, {
    start_time: data.previous_start_time,
    end_time: data.previous_end_time,
  });
}

/**
 * One message for a whole recurring series, rather than one per occurrence —
 * a weekly booking for a year would otherwise be 52 texts.
 *
 * Every occurrence shares the same time of day, so only the start time is
 * carried; the end time and the full list of dates are in the confirmation
 * email and the Telegram message, neither of which is limited to 70 characters.
 */
export function buildBulkReservationSmsMessage(data: {
  title: string;
  room_name: string;
  first_start: string;
  last_start: string;
  count: number;
  person_in_charge: string;
}): string {
  const head = `${data.count}회 ${monthDay(data.first_start)}~${monthDay(data.last_start)} ${hhmm(data.first_start)}`;
  return composeSms('예약', head, data.room_name, data.title, data.person_in_charge).text;
}
