/**
 * Telegram notifications for the church administrators.
 *
 * This channel exists because US SMS is gated behind A2P 10DLC registration
 * (weeks of carrier review) while Telegram needs no registration, costs nothing,
 * and works on iPhone as well as Android. It runs alongside `lib/sms` — either
 * channel can be left unconfigured without affecting the other.
 *
 * Delivery goes to one group chat rather than per-person chats: adding or
 * removing an administrator is then just a group invite, with no database or
 * admin-UI changes, and a bot cannot message a person who has not written to it
 * first anyway.
 */

const TELEGRAM_API = 'https://api.telegram.org';

/** Returns null when Telegram is not configured, so the channel is simply skipped. */
function getTelegramConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

/** Telegram parses the body as HTML, so user-supplied text must be escaped. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '2026-09-12T19:00:00' -> '9월 12일(금) 19:00'.
 *
 * Components are read straight off the stored string instead of parsing it into
 * a Date, so the result never shifts with the server's timezone. Only the
 * weekday needs a Date, and it is built from those same local components.
 */
/** Date without the time — the series message carries the shared time separately. */
function dateOnly(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${m}월 ${d}일(${DAYS_KO[new Date(y, m - 1, d).getDay()]})`;
}

function formatDateTime(iso: string): string {
  const [datePart, timePart = ''] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const day = DAYS_KO[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일(${day}) ${timePart.slice(0, 5)}`;
}

/** '2026-09-12T21:00:00' -> '21:00' */
function timeOnly(iso: string): string {
  return iso.slice(11, 16);
}

export async function sendTelegramNotification(message: string): Promise<void> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn('[telegram] 환경변수 미설정 — 텔레그램 발송을 건너뜁니다.');
    return;
  }

  // Must be awaited: on serverless the instance is frozen once the route
  // responds, which would kill an un-awaited request mid-flight.
  const res = await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    // Telegram returns a JSON body explaining the failure; surface it rather
    // than a bare status so misconfiguration is obvious in the logs.
    const detail = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage ${res.status}: ${detail.slice(0, 300)}`);
  }
}

function notesLine(notes?: string | null): string {
  return notes ? `\n메모 · ${esc(notes)}` : '';
}

export function buildReservationTelegramMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  notes?: string | null;
}): string {
  return (
    `🟢 <b>새 예약</b>\n` +
    `<b>${esc(data.title)}</b>\n\n` +
    `장소 · ${esc(data.room_name)}\n` +
    `일시 · ${formatDateTime(data.start_time)}–${timeOnly(data.end_time)}\n` +
    `담당 · ${esc(data.person_in_charge)}` +
    notesLine(data.notes)
  );
}

/**
 * One message for a whole recurring series. Telegram has no length limit, so
 * unlike the SMS this carries the full picture: the span, the shared time of
 * day, and how many dates were skipped because they were already taken.
 */
export function buildBulkReservationTelegramMessage(data: {
  title: string;
  room_name: string;
  first_start: string;
  last_start: string;
  end_time: string;
  count: number;
  conflicts: number;
  person_in_charge: string;
  notes?: string | null;
}): string {
  return (
    `🟢 <b>반복 예약</b>\n` +
    `<b>${esc(data.title)}</b>\n\n` +
    `장소 · ${esc(data.room_name)}\n` +
    `기간 · ${dateOnly(data.first_start)} ~ ${dateOnly(data.last_start)}\n` +
    `시간 · ${timeOnly(data.first_start)}–${timeOnly(data.end_time)} (총 ${data.count}회)\n` +
    (data.conflicts > 0 ? `제외 · 기존 예약과 겹쳐 ${data.conflicts}일 제외됨\n` : '') +
    `담당 · ${esc(data.person_in_charge)}` +
    notesLine(data.notes)
  );
}

export function buildCancellationTelegramMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  cancellation_reason?: string | null;
  /** One date out of a recurring series, rather than a standalone booking. */
  series_occurrence?: boolean;
}): string {
  return (
    `🔴 <b>예약 취소</b>\n` +
    `<b>${esc(data.title)}</b>\n\n` +
    `장소 · ${esc(data.room_name)}\n` +
    `일시 · ${formatDateTime(data.start_time)}–${timeOnly(data.end_time)}\n` +
    `담당 · ${esc(data.person_in_charge)}` +
    (data.cancellation_reason ? `\n사유 · ${esc(data.cancellation_reason)}` : '') +
    // Spelled out because the alarming reading is the wrong one: a coordinator
    // seeing a standing meeting in a cancellation notice will assume the whole
    // series is gone. It is also the signal that catches a run of one-at-a-time
    // cancellations while it is still running.
    (data.series_occurrence ? `\n\n🔁 <b>반복 예약 중 이 1회만 취소</b>되었습니다. 나머지 일정은 그대로입니다.` : '')
  );
}

export function buildUpdateTelegramMessage(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  previous_start_time: string;
  previous_end_time: string;
  notes?: string | null;
}): string {
  const timeChanged =
    data.previous_start_time !== data.start_time || data.previous_end_time !== data.end_time;
  const timeLine = timeChanged
    ? `일시 · <s>${formatDateTime(data.previous_start_time)}–${timeOnly(data.previous_end_time)}</s>\n` +
      `　　→ <b>${formatDateTime(data.start_time)}–${timeOnly(data.end_time)}</b>`
    : `일시 · ${formatDateTime(data.start_time)}–${timeOnly(data.end_time)}`;

  return (
    `🔵 <b>예약 변경</b>\n` +
    `<b>${esc(data.title)}</b>\n\n` +
    `장소 · ${esc(data.room_name)}\n` +
    `${timeLine}\n` +
    `담당 · ${esc(data.person_in_charge)}` +
    notesLine(data.notes)
  );
}
