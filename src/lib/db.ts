import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!_sql) {
    const cs = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? '';
    if (!cs) {
      throw new Error(
        'POSTGRES_URL or DATABASE_URL environment variable is required. Add it in .env.local or Vercel project settings.'
      );
    }
    _sql = neon(cs);
  }
  return _sql;
}

let _initPromise: Promise<void> | null = null;

async function ensureDbReady(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS rooms (
        id   SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reservation_series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        person_in_charge TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        notes TEXT,
        recurring TEXT NOT NULL,
        recurring_until TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reservations (
        id                SERIAL PRIMARY KEY,
        series_id         TEXT REFERENCES reservation_series(id),
        series_index      INTEGER,
        title             TEXT NOT NULL,
        room_id           INTEGER NOT NULL REFERENCES rooms(id),
        start_time        TEXT NOT NULL,
        end_time          TEXT NOT NULL,
        person_in_charge  TEXT NOT NULL,
        email             TEXT NOT NULL DEFAULT '',
        notes             TEXT,
        status            TEXT NOT NULL DEFAULT 'pending',
        rejection_reason  TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Add email column if migrating from older schema (idempotent)
    try {
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`;
    } catch {
      // Column may already exist; ignore
    }

    // Series columns (idempotent)
    try {
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS series_id TEXT REFERENCES reservation_series(id)`;
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS series_index INTEGER`;
    } catch {
      // Columns may already exist; ignore
    }

    // Cancellation request columns (idempotent)
    try {
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`;
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ`;
      await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS previous_status TEXT`;
    } catch {
      // Columns may already exist; ignore
    }

    // Seed rooms if empty
    const countRows = (await sql`SELECT COUNT(*)::int as c FROM rooms`) as { c: number }[];
    const count = Number(countRows[0]?.c ?? 0);
    if (count === 0) {
      const rooms = [
        { name: '비전홀 대예배실',         color: '#E74C3C' },
        { name: '비전홀 새가족실',         color: '#E67E22' },
        { name: '비전홀 영아부실',         color: '#F1C40F' },
        { name: '비전홀 유아부실',         color: '#2ECC71' },
        { name: '비전홀 유치부실',         color: '#1ABC9C' },
        { name: '비전홀 찬양대실',         color: '#3498DB' },
        { name: '비전홀 2층 교실 1',           color: '#2980B9' },
        { name: '비전홀 2층 교실 2',           color: '#b473ceff' },
        { name: '비전홀 2층 교실 3',           color: '#8E44AD' },
        { name: '비전홀 2층 교실 4',           color: '#D35400' },
        { name: '비전홀 2층 올리브홀(초등부)', color: '#af645cff' },
        { name: '비전홀 2층 초등부 교사실',    color: '#16A085' },
        { name: '은혜성전 친교실',        color: '#27AE60' },
        { name: '은혜성전 교실 1',             color: '#F39C12' },
        { name: '은혜성전 교실 2',             color: '#E91E63' },
        { name: '은혜성전 교실 3',             color: '#00BCD4' },
        { name: '은혜성전 교실 4',             color: '#8BC34A' },
        { name: '은혜성전 교실 5',             color: '#FF5722' },
        { name: '은혜성전 청년부실',           color: '#96c9e2ff' },
        { name: '은혜성전 (구)교역자실',       color: '#34495E' },
      ];

      for (const r of rooms) {
        await sql`INSERT INTO rooms (name, color) VALUES (${r.name}, ${r.color})`;
      }
    }
  })();

  return _initPromise;
}

// ---------- Types ----------

export interface Room {
  id: number;
  name: string;
  color: string;
}

export type ReservationStatus = 'pending' | 'approved' | 'rejected' | 'cancellation_requested';

export interface Reservation {
  id: number;
  series_id?: string | null;
  series_index?: number | null;
  title: string;
  room_id: number;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  notes: string | null;
  status: ReservationStatus;
  rejection_reason: string | null;
  created_at: string;
  cancellation_reason?: string | null;
  cancellation_requested_at?: string | null;
  previous_status?: string | null;
}

export interface ReservationWithRoom extends Reservation {
  room_name: string;
  room_color: string;
}

export type ReservationSeriesStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ReservationSeries {
  id: string;
  title: string;
  room_id: number;
  person_in_charge: string;
  email: string;
  notes: string | null;
  recurring: string;
  recurring_until: string;
  status: ReservationSeriesStatus;
  rejection_reason: string | null;
  created_at: string;
}

// ---------- Queries ----------

export async function getRooms(): Promise<Room[]> {
  await ensureDbReady();
  const rows = (await getSql()`SELECT * FROM rooms ORDER BY id`) as Room[];
  return rows;
}

export async function getReservations(
  from?: string,
  to?: string
): Promise<ReservationWithRoom[]> {
  await ensureDbReady();

  if (from && to) {
    const rows = (await getSql()`
      SELECT r.*, rm.name as room_name, rm.color as room_color
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE r.status != 'rejected' AND r.end_time >= ${from} AND r.start_time <= ${to}
      ORDER BY r.start_time
    `) as ReservationWithRoom[];
    return rows;
  }

  if (from) {
    const rows = (await getSql()`
      SELECT r.*, rm.name as room_name, rm.color as room_color
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE r.status != 'rejected' AND r.end_time >= ${from}
      ORDER BY r.start_time
    `) as ReservationWithRoom[];
    return rows;
  }

  if (to) {
    const rows = (await getSql()`
      SELECT r.*, rm.name as room_name, rm.color as room_color
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE r.status != 'rejected' AND r.start_time <= ${to}
      ORDER BY r.start_time
    `) as ReservationWithRoom[];
    return rows;
  }

  const rows = (await getSql()`
    SELECT r.*, rm.name as room_name, rm.color as room_color
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    WHERE r.status != 'rejected'
    ORDER BY r.start_time
  `) as ReservationWithRoom[];
  return rows;
}

export async function getReservationById(
  id: number
): Promise<ReservationWithRoom | null> {
  await ensureDbReady();
  const rows = (await getSql()`
    SELECT r.*, rm.name as room_name, rm.color as room_color
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    WHERE r.id = ${id}
  `) as ReservationWithRoom[];
  return rows[0] ?? null;
}

export async function getAllReservationsForAdmin(from?: string): Promise<
  ReservationWithRoom[]
> {
  await ensureDbReady();
  const sql = getSql();
  const rows = (from
    ? await sql`
        SELECT r.*, rm.name as room_name, rm.color as room_color
        FROM reservations r
        JOIN rooms rm ON r.room_id = rm.id
        WHERE r.start_time >= ${from}
        ORDER BY r.start_time ASC
      `
    : await sql`
        SELECT r.*, rm.name as room_name, rm.color as room_color
        FROM reservations r
        JOIN rooms rm ON r.room_id = rm.id
        ORDER BY r.start_time ASC
      `
  ) as ReservationWithRoom[];
  return rows;
}

export async function createReservation(data: {
  series_id?: string | null;
  series_index?: number | null;
  title: string;
  room_id: number;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  notes?: string;
}): Promise<Reservation> {
  await ensureDbReady();
  const rows = (await getSql()`
    INSERT INTO reservations (series_id, series_index, title, room_id, start_time, end_time, person_in_charge, email, notes)
    VALUES (${data.series_id ?? null}, ${data.series_index ?? null}, ${data.title}, ${data.room_id}, ${data.start_time}, ${data.end_time}, ${data.person_in_charge}, ${data.email}, ${data.notes ?? null})
    RETURNING *
  `) as Reservation[];
  return rows[0];
}

export async function createReservationSeries(data: {
  id: string;
  title: string;
  room_id: number;
  person_in_charge: string;
  email: string;
  notes?: string;
  recurring: string;
  recurring_until: string;
}): Promise<ReservationSeries> {
  await ensureDbReady();
  const rows = (await getSql()`
    INSERT INTO reservation_series (id, title, room_id, person_in_charge, email, notes, recurring, recurring_until)
    VALUES (${data.id}, ${data.title}, ${data.room_id}, ${data.person_in_charge}, ${data.email}, ${data.notes ?? null}, ${data.recurring}, ${data.recurring_until})
    RETURNING *
  `) as ReservationSeries[];
  return rows[0];
}

export async function getConflictingReservationsForRange(
  room_id: number,
  minStart: string,
  maxEnd: string
): Promise<Array<{ start_time: string; end_time: string }>> {
  await ensureDbReady();
  const rows = (await getSql()`
    SELECT start_time, end_time FROM reservations
    WHERE room_id = ${room_id}
      AND status IN ('pending', 'approved', 'cancellation_requested')
      AND start_time < ${maxEnd}
      AND end_time > ${minStart}
  `) as Array<{ start_time: string; end_time: string }>;
  return rows;
}

export async function createReservationsBulk(data: {
  series_id: string;
  title: string;
  room_id: number;
  person_in_charge: string;
  email: string;
  notes?: string;
  occurrences: Array<{ start_time: string; end_time: string; series_index: number }>;
}): Promise<Reservation[]> {
  await ensureDbReady();
  const startTimes = data.occurrences.map((o) => o.start_time);
  const endTimes = data.occurrences.map((o) => o.end_time);
  const indices = data.occurrences.map((o) => o.series_index);
  const rows = (await getSql()`
    INSERT INTO reservations (series_id, series_index, title, room_id, start_time, end_time, person_in_charge, email, notes)
    SELECT ${data.series_id}, idx, ${data.title}, ${data.room_id}, st, et, ${data.person_in_charge}, ${data.email}, ${data.notes ?? null}
    FROM unnest(${startTimes}::text[], ${endTimes}::text[], ${indices}::int[]) AS t(st, et, idx)
    RETURNING *
  `) as Reservation[];
  return rows;
}

export async function checkConflict(
  room_id: number,
  start_time: string,
  end_time: string,
  excludeId?: number
): Promise<boolean> {
  await ensureDbReady();
  const rid = Number(room_id);

  if (excludeId !== undefined) {
    const rows = (await getSql()`
      SELECT COUNT(*)::int as c FROM reservations
      WHERE room_id = ${rid}
        AND status IN ('pending', 'approved', 'cancellation_requested')
        AND start_time < ${end_time}
        AND end_time > ${start_time}
        AND id != ${excludeId}
    `) as { c: number }[];
    return Number(rows[0]?.c ?? 0) > 0;
  }

  const rows = (await getSql()`
    SELECT COUNT(*)::int as c FROM reservations
    WHERE room_id = ${rid}
      AND status IN ('pending', 'approved', 'cancellation_requested')
      AND start_time < ${end_time}
      AND end_time > ${start_time}
  `) as { c: number }[];
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function approveReservation(id: number): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservations
    SET status = 'approved', rejection_reason = NULL
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function approveReservationsBySeries(seriesId: string): Promise<ReservationWithRoom[]> {
  await ensureDbReady();
  const rows = (await getSql()`
    WITH updated AS (
      UPDATE reservations
      SET status = 'approved', rejection_reason = NULL
      WHERE series_id = ${seriesId} AND status = 'pending'
      RETURNING *
    )
    SELECT u.*, rm.name as room_name, rm.color as room_color
    FROM updated u
    JOIN rooms rm ON u.room_id = rm.id
    ORDER BY u.start_time
  `) as ReservationWithRoom[];
  return rows;
}

export async function setReservationSeriesStatus(
  seriesId: string,
  status: ReservationSeriesStatus,
  rejectionReason?: string | null
): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservation_series
    SET status = ${status},
        rejection_reason = ${rejectionReason ?? null}
    WHERE id = ${seriesId}
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function rejectReservation(
  id: number,
  reason: string
): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservations
    SET status = 'rejected', rejection_reason = ${reason}
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function rejectReservationsBySeries(seriesId: string, reason: string): Promise<ReservationWithRoom[]> {
  await ensureDbReady();
  const rows = (await getSql()`
    WITH updated AS (
      UPDATE reservations
      SET status = 'rejected', rejection_reason = ${reason}
      WHERE series_id = ${seriesId} AND status = 'pending'
      RETURNING *
    )
    SELECT u.*, rm.name as room_name, rm.color as room_color
    FROM updated u
    JOIN rooms rm ON u.room_id = rm.id
    ORDER BY u.start_time
  `) as ReservationWithRoom[];
  await setReservationSeriesStatus(seriesId, 'rejected', reason);
  return rows;
}

export async function deleteReservation(id: number): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    DELETE FROM reservations
    WHERE id = ${id} AND status = 'approved'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function requestCancellation(
  id: number,
  reason: string
): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservations
    SET status = 'cancellation_requested',
        cancellation_reason = ${reason},
        cancellation_requested_at = now(),
        previous_status = status
    WHERE id = ${id} AND status IN ('pending', 'approved')
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function requestCancellationSeries(
  seriesId: string,
  fromStartTimeInclusive: string,
  reason: string
): Promise<number> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservations
    SET status = 'cancellation_requested',
        cancellation_reason = ${reason},
        cancellation_requested_at = now(),
        previous_status = status
    WHERE series_id = ${seriesId}
      AND start_time >= ${fromStartTimeInclusive}
      AND status IN ('pending', 'approved')
    RETURNING id
  `) as { id: number }[];
  return rows.length;
}

export async function approveCancellation(id: number): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    DELETE FROM reservations
    WHERE id = ${id} AND status = 'cancellation_requested'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function rejectCancellation(id: number): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    UPDATE reservations
    SET status = COALESCE(previous_status, 'approved'),
        cancellation_reason = NULL,
        cancellation_requested_at = NULL,
        previous_status = NULL
    WHERE id = ${id} AND status = 'cancellation_requested'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function approveCancellationBySeries(seriesId: string): Promise<ReservationWithRoom[]> {
  await ensureDbReady();
  const rows = (await getSql()`
    WITH deleted AS (
      DELETE FROM reservations
      WHERE series_id = ${seriesId} AND status = 'cancellation_requested'
      RETURNING *
    )
    SELECT d.*, rm.name as room_name, rm.color as room_color
    FROM deleted d
    JOIN rooms rm ON d.room_id = rm.id
    ORDER BY d.start_time
  `) as ReservationWithRoom[];
  await setReservationSeriesStatus(seriesId, 'cancelled');
  return rows;
}

export async function rejectCancellationBySeries(seriesId: string, reason?: string | null): Promise<ReservationWithRoom[]> {
  await ensureDbReady();
  const rows = (await getSql()`
    WITH updated AS (
      UPDATE reservations
      SET status = COALESCE(previous_status, 'approved'),
          cancellation_reason = NULL,
          cancellation_requested_at = NULL,
          previous_status = NULL
      WHERE series_id = ${seriesId} AND status = 'cancellation_requested'
      RETURNING *
    )
    SELECT u.*, rm.name as room_name, rm.color as room_color
    FROM updated u
    JOIN rooms rm ON u.room_id = rm.id
    ORDER BY u.start_time
  `) as ReservationWithRoom[];
  return rows;
}
