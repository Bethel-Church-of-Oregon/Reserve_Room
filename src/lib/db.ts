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
      CREATE TABLE IF NOT EXISTS reservations (
        id                SERIAL PRIMARY KEY,
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

    // Seed rooms if empty
    const countRows = (await sql`SELECT COUNT(*)::int as c FROM rooms`) as { c: number }[];
    const count = Number(countRows[0]?.c ?? 0);
    if (count === 0) {
      const rooms = [
        { name: '본당', color: '#E74C3C' },
        { name: '소예배실', color: '#3498DB' },
        { name: '친교실', color: '#2ECC71' },
        { name: '교육관 1호', color: '#F39C12' },
        { name: '교육관 2호', color: '#9B59B6' },
        { name: '교육관 3호', color: '#1ABC9C' },
        { name: '청년부실', color: '#E67E22' },
        { name: '중고등부실', color: '#2980B9' },
        { name: '어린이부실', color: '#27AE60' },
        { name: '유아부실', color: '#8E44AD' },
        { name: '기도실 A', color: '#F1C40F' },
        { name: '기도실 B', color: '#16A085' },
        { name: '세미나실', color: '#D35400' },
        { name: '도서실', color: '#C0392B' },
        { name: '사무실', color: '#34495E' },
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

export type ReservationStatus = 'pending' | 'approved' | 'rejected';

export interface Reservation {
  id: number;
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
}

export interface ReservationWithRoom extends Reservation {
  room_name: string;
  room_color: string;
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

export async function getAllReservationsForAdmin(): Promise<
  ReservationWithRoom[]
> {
  await ensureDbReady();
  const rows = (await getSql()`
    SELECT r.*, rm.name as room_name, rm.color as room_color
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    ORDER BY r.created_at DESC
  `) as ReservationWithRoom[];
  return rows;
}

export async function createReservation(data: {
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
    INSERT INTO reservations (title, room_id, start_time, end_time, person_in_charge, email, notes)
    VALUES (${data.title}, ${data.room_id}, ${data.start_time}, ${data.end_time}, ${data.person_in_charge}, ${data.email}, ${data.notes ?? null})
    RETURNING *
  `) as Reservation[];
  return rows[0];
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
        AND status != 'rejected'
        AND start_time < ${end_time}
        AND end_time > ${start_time}
        AND id != ${excludeId}
    `) as { c: number }[];
    return Number(rows[0]?.c ?? 0) > 0;
  }

  const rows = (await getSql()`
    SELECT COUNT(*)::int as c FROM reservations
    WHERE room_id = ${rid}
      AND status != 'rejected'
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

export async function deleteReservation(id: number): Promise<boolean> {
  await ensureDbReady();
  const rows = (await getSql()`
    DELETE FROM reservations
    WHERE id = ${id} AND status = 'approved'
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}
