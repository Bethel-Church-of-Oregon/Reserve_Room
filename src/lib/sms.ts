import nodemailer from 'nodemailer';
import { getNotificationRecipients } from './db';

export const CARRIER_GATEWAYS: Record<string, string> = {
  tmobile:   'tmomail.net',
  att:       'txt.att.net',
  verizon:   'vtext.com',
  sprint:    'messaging.sprintpcs.com',
  cricket:   'sms.cricketwireless.net',
  boost:     'sms.myboostmobile.com',
  metro:     'mymetropcs.com',
  uscellular:'email.uscc.net',
};

export const CARRIER_LABELS: Record<string, string> = {
  tmobile:   'T-Mobile',
  att:       'AT&T',
  verizon:   'Verizon',
  sprint:    'Sprint',
  cricket:   'Cricket',
  boost:     'Boost Mobile',
  metro:     'Metro by T-Mobile',
  uscellular:'US Cellular',
};

function getTransporter() {
  const user = process.env.GMAIL_USER?.trim() || 'bethel.oregon.dev@gmail.com';
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD },
  });
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
  if (!process.env.GMAIL_APP_PASSWORD) return;

  const recipients = await getNotificationRecipients();
  if (recipients.length === 0) return;

  const transporter = getTransporter();
  const from = process.env.GMAIL_USER?.trim() || 'bethel.oregon.dev@gmail.com';

  for (const r of recipients) {
    const gateway = CARRIER_GATEWAYS[r.carrier];
    if (!gateway) continue;
    const to = `${r.phone.replace(/\D/g, '')}@${gateway}`;
    transporter.sendMail({ from, to, subject: '', text: message })
      .catch((e) => console.error('[sms] 발송 실패:', r.name, e));
  }
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
  return `[벧엘예약] ${data.title} | ${data.room_name} | ${start}-${endTime} | ${data.person_in_charge}`;
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
  return `[벧엘취소] ${data.title} | ${data.room_name} | ${start}-${endTime} | ${data.person_in_charge}`;
}
