import nodemailer from 'nodemailer';
import { ReservationWithRoom } from './db';

function getEmailSender(): string {
  const sender = process.env.GMAIL_USER?.trim();
  return sender || 'bethel.oregon.dev@gmail.com';
}

let _transporter: nodemailer.Transporter | null = null;

/**
 * One transporter per instance, built on first use.
 *
 * Deliberately *not* pooled. Pooling would keep SMTP sockets open between sends,
 * but Vercel freezes the instance the moment a response goes out, so those
 * sockets are usually dead by the next invocation — and a send that waits on a
 * dead socket stalls a request we already await before responding. A fresh
 * connection per message is the cheaper failure mode here.
 *
 * The timeouts matter for the same reason: every send is awaited before the
 * route responds, so without them an unresponsive Gmail would hold the request
 * open until Vercel's own 300-second ceiling instead of failing and letting the
 * reservation succeed without its confirmation mail.
 */
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: getEmailSender(),
        // Google displays the app password in four spaced groups, so it gets
        // pasted in that way as often as not. Strip the spaces rather than
        // making the format a thing anyone has to get right.
        pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return _transporter;
}

/**
 * Monthly database backup, sent to the church Gmail account as attachments.
 *
 * Vercel functions have no persistent storage, so a scheduled backup has to
 * leave the platform to be worth anything. Mail is the one channel already
 * wired up here, and an inbox gives the copy something a local file does not:
 * it is off-site, dated, and kept even if the Vercel project or the Neon
 * database is lost outright.
 */
export async function sendBackupEmail(data: {
  backupJson: string;
  csv: string;
  dateKey: string;
  rowCounts: Record<string, number>;
  databaseSize: string;
  schemaVersion: string | null;
}): Promise<void> {
  // Every other sender here returns quietly when mail is not configured, because
  // a reservation must still succeed without its confirmation. A backup is the
  // opposite: skipping it silently leaves the church believing it has copies it
  // does not have, so this one throws and the cron run fails visibly.
  if (!process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_APP_PASSWORD 미설정 — 백업 메일을 보낼 수 없습니다.');
  }

  const sender = getEmailSender();
  const rows = Object.entries(data.rowCounts)
    .map(([t, n]) => `<tr><td style="padding:4px 16px 4px 0;">${escapeHtml(t)}</td><td style="padding:4px 0; text-align:right; font-variant-numeric:tabular-nums;">${n}행</td></tr>`)
    .join('');

  await getTransporter().sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${sender}>`,
    to: sender,
    subject: `[백업] 예약 데이터 ${data.dateKey}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px;">
        <h2 style="font-size:17px; margin:0 0 4px;">예약 데이터 백업</h2>
        <p style="color:#6b7280; font-size:13px; margin:0 0 16px;">${escapeHtml(data.dateKey)} 자동 백업</p>
        <table style="font-size:14px; border-collapse:collapse;">${rows}</table>
        <p style="font-size:13px; color:#6b7280; margin:16px 0 0;">
          DB 크기 ${escapeHtml(data.databaseSize)} · schema_version ${escapeHtml(data.schemaVersion ?? '미기록')}
        </p>
        <p style="font-size:13px; color:#374151; margin:16px 0 0;">
          복원: <code>npm run restore -- backup-${escapeHtml(data.dateKey)}.json --yes</code><br>
          빈 데이터베이스라면 앱을 한 번 실행해 스키마를 만든 뒤 복원하세요.
        </p>
        <p style="font-size:12px; color:#9ca3af; margin:20px 0 0;">
          첨부 파일에는 예약자 이메일이 들어 있습니다. 전달하지 마세요.
        </p>
      </div>
    `,
    attachments: [
      { filename: `backup-${data.dateKey}.json`, content: data.backupJson, contentType: 'application/json' },
      { filename: `reservations-${data.dateKey}.csv`, content: data.csv, contentType: 'text/csv' },
    ],
  });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function sendReservationCreatedEmail(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  notes?: string;
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  const notesRow = data.notes ? `
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">기타 노트</td>
            <td style="padding:8px 12px;">${escapeHtml(data.notes)}</td>
          </tr>` : '';
  await transporter.sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘장로교회] 장소 예약이 완료되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">예약 완료 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p>장소 예약이 <strong style="color: #16a34a;">완료</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(data.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(data.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(data.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(data.end_time)}</td>
          </tr>${notesRow}
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘장로교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

export async function sendReservationCreatedBulkEmail(data: {
  title: string;
  room_name: string;
  person_in_charge: string;
  email: string;
  occurrences: Array<{ start_time: string; end_time: string }>;
  created: number;
  notes?: string;
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  const rows = data.occurrences.map((o, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9fafb' : 'white'};">
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(o.start_time)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(o.end_time)}</td>
    </tr>
  `).join('');
  const notesRow = data.notes ? `
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px; font-weight:600; width:30%;">기타 노트</td>
          <td style="padding:8px 12px;">${escapeHtml(data.notes)}</td>
        </tr>` : '';
  await transporter.sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘장로교회] ${data.created}건 반복 예약이 완료되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">반복 예약 완료 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p><strong>${escapeHtml(data.title)}</strong> (${escapeHtml(data.room_name)}) 반복 예약 <strong style="color:#16a34a;">${data.created}건</strong>이 완료되었습니다.</p>
        ${data.notes ? `<table style="width:100%; border-collapse:collapse; margin: 16px 0;">${notesRow}</table>` : ''}
        <table style="width:100%; border-collapse:collapse; margin: 16px 0; font-size:14px;">
          <thead>
            <tr style="background:#1e3a8a; color:white;">
              <th style="padding:10px 12px; text-align:left;">시작</th>
              <th style="padding:10px 12px; text-align:left;">종료</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘장로교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

export async function sendReservationUpdatedEmail(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  notes?: string | null;
  previous_title: string;
  previous_start_time: string;
  previous_end_time: string;
  previous_person_in_charge: string;
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();

  const timeChanged =
    data.previous_start_time !== data.start_time || data.previous_end_time !== data.end_time;
  const titleChanged = data.previous_title !== data.title;
  const personChanged = data.previous_person_in_charge !== data.person_in_charge;

  const beforeAfter = (label: string, before: string, after: string, shaded: boolean) => `
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600; width:30%;">${label}</td>
            <td style="padding:8px 12px;">
              <span style="color:#9ca3af; text-decoration:line-through;">${before}</span>
              <span style="color:#9ca3af;"> &rarr; </span>
              <strong style="color:#2563eb;">${after}</strong>
            </td>
          </tr>`;

  let shaded = true;
  const rows: string[] = [];
  if (titleChanged) {
    rows.push(beforeAfter('제목', escapeHtml(data.previous_title), escapeHtml(data.title), shaded));
    shaded = !shaded;
  } else {
    rows.push(`
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(data.title)}</td>
          </tr>`);
    shaded = !shaded;
  }
  rows.push(`
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(data.room_name)}</td>
          </tr>`);
  shaded = !shaded;
  if (timeChanged) {
    rows.push(beforeAfter('시작', formatTime(data.previous_start_time), formatTime(data.start_time), shaded));
    shaded = !shaded;
    rows.push(beforeAfter('종료', formatTime(data.previous_end_time), formatTime(data.end_time), shaded));
    shaded = !shaded;
  } else {
    rows.push(`
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600;">시간</td>
            <td style="padding:8px 12px;">${formatTime(data.start_time)} ~ ${formatTime(data.end_time)}</td>
          </tr>`);
    shaded = !shaded;
  }
  if (personChanged) {
    rows.push(beforeAfter('담당자', escapeHtml(data.previous_person_in_charge), escapeHtml(data.person_in_charge), shaded));
    shaded = !shaded;
  } else {
    rows.push(`
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600;">담당자</td>
            <td style="padding:8px 12px;">${escapeHtml(data.person_in_charge)}</td>
          </tr>`);
    shaded = !shaded;
  }
  if (data.notes) {
    rows.push(`
          <tr${shaded ? ' style="background:#f3f4f6;"' : ''}>
            <td style="padding:8px 12px; font-weight:600;">기타 노트</td>
            <td style="padding:8px 12px;">${escapeHtml(data.notes)}</td>
          </tr>`);
  }

  await transporter.sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘장로교회] 예약이 변경되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">예약 변경 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p>아래와 같이 예약이 <strong style="color: #2563eb;">변경</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">${rows.join('')}
        </table>
        <p style="color:#6b7280; font-size:13px;">장소 또는 날짜를 바꾸시려면 예약을 취소하신 후 다시 신청해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘장로교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

export async function sendReservationCancelledEmail(data: {
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  cancellation_reason: string;
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘장로교회] 예약이 취소되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">예약 취소 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p>아래 예약이 <strong style="color: #dc2626;">취소</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(data.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(data.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(data.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(data.end_time)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">취소 사유</td>
            <td style="padding:8px 12px;">${escapeHtml(data.cancellation_reason)}</td>
          </tr>
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘장로교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

export async function sendReservationCancelledSeriesEmail(data: {
  title: string;
  room_name: string;
  from_start_time: string;
  person_in_charge: string;
  email: string;
  cancelled_count: number;
  cancellation_reason: string;
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"오레곤벧엘장로교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘장로교회] 반복 예약 ${data.cancelled_count}건이 취소되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">반복 예약 취소 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p><strong>${escapeHtml(data.title)}</strong> (${escapeHtml(data.room_name)}) 반복 예약 중 <strong>${formatTime(data.from_start_time)}</strong>부터 이후 <strong style="color: #dc2626;">${data.cancelled_count}건</strong>이 취소되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">취소 사유</td>
            <td style="padding:8px 12px;">${escapeHtml(data.cancellation_reason)}</td>
          </tr>
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘장로교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

