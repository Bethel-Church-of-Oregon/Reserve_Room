import nodemailer from 'nodemailer';
import { ReservationWithRoom } from './db';

const SENDER = 'bethel.oregon.dev@gmail.com';

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SENDER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function sendApprovalEmail(reservation: ReservationWithRoom): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${SENDER}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 장소 예약이 확정되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #2563eb;">예약 확정 안내</h2>
        <p>안녕하세요, <strong>${reservation.person_in_charge}</strong>성도님.</p>
        <p>신청하신 장소 예약이 <strong style="color: #16a34a;">확정</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${reservation.title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${reservation.room_name}</td>
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

export async function sendRejectionEmail(reservation: ReservationWithRoom, reason: string): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[email] GMAIL_APP_PASSWORD 환경변수가 설정되지 않아 이메일을 건너뜁니다.');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"오레곤벧엘교회 장소예약시스템" <${SENDER}>`,
    to: reservation.email,
    subject: `[오레곤벧엘교회] 장소 예약 신청이 거절되었습니다 — ${reservation.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
        <h2 style="color: #dc2626;">예약 거절 안내</h2>
        <p>안녕하세요, <strong>${reservation.person_in_charge}</strong>성도님.</p>
        <p>신청하신 장소 예약이 <strong style="color: #dc2626;">거절</strong>되었습니다.</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px 12px; font-weight:600; width:30%;">제목</td>
            <td style="padding:8px 12px;">${reservation.title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:600;">장소</td>
            <td style="padding:8px 12px;">${reservation.room_name}</td>
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
            <td style="padding:8px 12px; color:#dc2626;">${reason}</td>
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
