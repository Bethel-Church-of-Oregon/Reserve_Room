import nodemailer from 'nodemailer';
import { ReservationWithRoom } from './db';

function getEmailSender(): string {
  const sender = process.env.GMAIL_USER?.trim();
  return sender || 'bethel.oregon.dev@gmail.com';
}

function getTransporter() {
  const sender = getEmailSender();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: sender,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
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
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘교회] 장소 예약이 완료되었습니다 — ${data.title}`,
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
          </tr>
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
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
}): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  const rows = data.occurrences.map((o, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9fafb' : 'white'};">
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(o.start_time)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(o.end_time)}</td>
    </tr>
  `).join('');
  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: data.email,
    subject: `[오레곤벧엘교회] ${data.created}건 반복 예약이 완료되었습니다 — ${data.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">반복 예약 완료 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(data.person_in_charge)}</strong>성도님.</p>
        <p><strong>${escapeHtml(data.title)}</strong> (${escapeHtml(data.room_name)}) 반복 예약 <strong style="color:#16a34a;">${data.created}건</strong>이 완료되었습니다.</p>
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
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
      </div>
    `,
  }).catch((e) => console.error('[email] 발송 실패:', e));
}

export async function sendApprovalEmail(reservation: ReservationWithRoom): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 장소 예약이 확정되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">예약 확정 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(reservation.person_in_charge)}</strong>성도님.</p>
        <p>신청하신 장소 예약이 <strong style="color: #16a34a;">확정</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(reservation.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(reservation.end_time)}</td>
          </tr>
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
      </div>
    `,
  });
}

// 일괄 승인 시 이메일별로 묶어서 한 번에 발송
export async function sendBulkApprovalEmail(reservations: ReservationWithRoom[]): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }
  if (reservations.length === 0) return;

  const transporter = getTransporter();

  // 이메일 주소별로 그룹화
  const byEmail = new Map<string, ReservationWithRoom[]>();
  for (const r of reservations) {
    if (!byEmail.has(r.email)) byEmail.set(r.email, []);
    byEmail.get(r.email)!.push(r);
  }

  for (const [email, rsvs] of Array.from(byEmail)) {
    const name = rsvs[0].person_in_charge;

    if (rsvs.length === 1) {
      // 1건이면 단건 이메일 형식 사용
      await transporter.sendMail({
        from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
        to: email,
        subject: `[오레곤벧엘교회] 장소 예약이 확정되었습니다 — ${rsvs[0].title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
            <h2 style="color: #2563eb;">예약 확정 안내</h2>
            <p>안녕하세요, <strong>${escapeHtml(name)}</strong>성도님.</p>
            <p>신청하신 장소 예약이 <strong style="color: #16a34a;">확정</strong>되었습니다.</p>
            <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
              <tr style="background:#f3f4f6;">
                <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
                <td style="padding:8px 12px;">${escapeHtml(rsvs[0].title)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; font-weight:600;">장소</td>
                <td style="padding:8px 12px;">${escapeHtml(rsvs[0].room_name)}</td>
              </tr>
              <tr style="background:#f3f4f6;">
                <td style="padding:8px 12px; font-weight:600;">시작</td>
                <td style="padding:8px 12px;">${formatTime(rsvs[0].start_time)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px; font-weight:600;">종료</td>
                <td style="padding:8px 12px;">${formatTime(rsvs[0].end_time)}</td>
              </tr>
            </table>
            <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
            <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
          </div>
        `,
      }).catch((e) => console.error('[email] 발송 실패:', e));
    } else {
      // 2건 이상이면 요약 이메일 발송
      const rows = rsvs.map((r: ReservationWithRoom, i: number) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : 'white'};">
          <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">${escapeHtml(r.title)}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">${escapeHtml(r.room_name)}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(r.start_time)}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${formatTime(r.end_time)}</td>
        </tr>
      `).join('');

      await transporter.sendMail({
        from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
        to: email,
        subject: `[오레곤벧엘교회] ${rsvs.length}건 장소 예약이 확정되었습니다`,
        html: `
          <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #333;">
            <h2 style="color: #2563eb;">예약 확정 안내</h2>
            <p>안녕하세요, <strong>${escapeHtml(name)}</strong>성도님.</p>
            <p>신청하신 <strong style="color: #16a34a;">${rsvs.length}건</strong>의 장소 예약이 모두 확정되었습니다.</p>
            <table style="width:100%; border-collapse:collapse; margin: 16px 0; font-size:14px;">
              <thead>
                <tr style="background:#1e3a8a; color:white;">
                  <th style="padding:10px 12px; text-align:left; font-weight:600;">제목</th>
                  <th style="padding:10px 12px; text-align:left; font-weight:600;">장소</th>
                  <th style="padding:10px 12px; text-align:left; font-weight:600;">시작</th>
                  <th style="padding:10px 12px; text-align:left; font-weight:600;">종료</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
            <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
          </div>
        `,
      }).catch((e) => console.error('[email] 발송 실패:', e));
    }
  }
}

export async function sendCancellationApprovedEmail(reservation: ReservationWithRoom): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 예약 취소가 승인되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #16a34a;">예약 취소 승인 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(reservation.person_in_charge)}</strong>성도님.</p>
        <p>요청하신 예약 취소가 <strong style="color: #16a34a;">승인</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(reservation.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(reservation.end_time)}</td>
          </tr>
        </table>
        <p>해당 일정은 캘린더에서 제거되었습니다.</p>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
      </div>
    `,
  });
}

export async function sendCancellationRejectedEmail(reservation: ReservationWithRoom, reason?: string): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();
  const reasonRow = reason ? `
    <tr style="background:#fef2f2;">
      <td style="padding:8px 12px; font-weight:600; color:#dc2626;">거절 사유</td>
      <td style="padding:8px 12px; color:#dc2626;">${escapeHtml(reason)}</td>
    </tr>
  ` : '';

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 예약 취소 요청이 거절되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">예약 취소 거절 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(reservation.person_in_charge)}</strong>성도님.</p>
        <p>요청하신 예약 취소가 <strong style="color: #dc2626;">거절</strong>되었습니다.</p>
        <p>해당 예약은 유지됩니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(reservation.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(reservation.end_time)}</td>
          </tr>
          ${reasonRow}
        </table>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
      </div>
    `,
  });
}

export async function sendRejectionEmail(reservation: ReservationWithRoom, reason: string): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${getEmailSender()}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 장소 예약 신청이 거절되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">예약 거절 안내</h2>
        <p>안녕하세요, <strong>${escapeHtml(reservation.person_in_charge)}</strong>성도님.</p>
        <p>신청하신 장소 예약이 <strong style="color: #dc2626;">거절</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.title)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${escapeHtml(reservation.room_name)}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600;">시작</td>
            <td style="padding:8px 12px;">${formatTime(reservation.start_time)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">종료</td>
            <td style="padding:8px 12px;">${formatTime(reservation.end_time)}</td>
          </tr>
          <tr style="background:#fef2f2;">
            <td style="padding:8px 12px; font-weight:600; color:#dc2626;">거절 사유</td>
            <td style="padding:8px 12px; color:#dc2626;">${escapeHtml(reason)}</td>
          </tr>
        </table>
        <p>다른 시간이나 장소로 다시 신청하시려면 예약 시스템을 이용해 주세요.</p>
        <p style="color:#6b7280; font-size:13px;">문의사항이 있으시면 교회 사무실로 연락해 주세요.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
        <p style="font-size:12px; color:#9ca3af;">오레곤벧엘교회 장소예약시스템</p>
      </div>
    `,
  });
}
