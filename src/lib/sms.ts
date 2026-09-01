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

function formatSmsTime(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
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

export function buildReservationSmsMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
}): string {
  const start = formatSmsTime(data.start_time);
  const endTime = data.end_time.slice(11, 16);
  return `[예약] ${data.title} | ${data.room_name} | ${start}-${endTime} | ${data.person_in_charge}`;
}

export function buildCancellationSmsMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
}): string {
  const start = formatSmsTime(data.start_time);
  const endTime = data.end_time.slice(11, 16);
  return `[취소] ${data.title} | ${data.room_name} | ${start}-${endTime} | ${data.person_in_charge}`;
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
  const start = formatSmsTime(data.start_time);
  const endTime = data.end_time.slice(11, 16);
  const timeChanged =
    data.previous_start_time !== data.start_time || data.previous_end_time !== data.end_time;
  const before = timeChanged
    ? `${formatSmsTime(data.previous_start_time)}-${data.previous_end_time.slice(11, 16)} → `
    : '';
  return `[변경] ${data.title} | ${data.room_name} | ${before}${start}-${endTime} | ${data.person_in_charge}`;
}
