import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { collectBackup, reservationsCsv, totalRows } from '@/lib/backup.mjs';
import { sendBackupEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Monthly database backup, mailed to the church Gmail account.
 *
 * Scheduled from vercel.json. Neon's Free plan keeps six hours of instant
 * restore and one manual snapshot, which is no protection at all against a
 * mistake nobody notices the same morning — so a copy leaves the platform every
 * month on its own, without anyone having to remember.
 *
 * Reads with its own connection and never calls `ensureDbReady()`: a backup
 * should capture the database as it finds it, not run migrations against it.
 */
export async function GET(req: NextRequest) {
  // Vercel attaches `Authorization: Bearer $CRON_SECRET` only when that variable
  // is set. With no secret configured the route would be world-callable, and
  // anyone could make the server mail out every reserver's address — so a
  // missing secret disables the endpoint rather than leaving it open.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET 미설정 — 백업 엔드포인트를 비활성화합니다.');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ error: 'no database url' }, { status: 500 });
  }

  try {
    const sql = neon(connectionString);
    const backup = await collectBackup((text: string, params?: unknown[]) => sql.query(text, params));

    // An empty export looks like protection while being none, so it is treated
    // as a failure and the mail is not sent — a 500 here shows up in Vercel's
    // logs, where a cheerful empty backup would not.
    if (backup.rowCounts.reservations === 0) {
      console.error('[cron] 예약이 0행 — 백업 메일을 보내지 않습니다.');
      return NextResponse.json({ error: 'empty backup' }, { status: 500 });
    }

    await sendBackupEmail({
      backupJson: JSON.stringify(backup, null, 2),
      csv: reservationsCsv(backup),
      dateKey: backup.backedUpAt.slice(0, 10),
      rowCounts: backup.rowCounts,
      databaseSize: backup.databaseSize,
      schemaVersion: backup.schemaVersion,
    });

    console.log(`[cron] 백업 메일 발송됨 — ${totalRows(backup)}행`);
    return NextResponse.json({ ok: true, rows: totalRows(backup), counts: backup.rowCounts });
  } catch (e) {
    console.error('[cron] 백업 실패:', e);
    return NextResponse.json({ error: '백업 실패' }, { status: 500 });
  }
}
