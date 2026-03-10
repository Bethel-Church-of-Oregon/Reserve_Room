import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'reservations.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  seedRooms(_db);

  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT    NOT NULL UNIQUE,
      color TEXT   NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      title             TEXT    NOT NULL,
      room_id           INTEGER NOT NULL REFERENCES rooms(id),
      start_time        TEXT    NOT NULL,
      end_time          TEXT    NOT NULL,
      person_in_charge  TEXT    NOT NULL,
      notes             TEXT,
      status            TEXT    NOT NULL DEFAULT 'pending',
      rejection_reason  TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
}

function seedRooms(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM rooms').get() as { c: number }).c;
  if (count > 0) return;

  const rooms = [
    { name: '본당',         color: '#E74C3C' },
    { name: '소예배실',      color: '#3498DB' },
    { name: '친교실',        color: '#2ECC71' },
    { name: '교육관 1호',    color: '#F39C12' },
    { name: '교육관 2호',    color: '#9B59B6' },
    { name: '교육관 3호',    color: '#1ABC9C' },
    { name: '청년부실',      color: '#E67E22' },
    { name: '중고등부실',    color: '#2980B9' },
    { name: '어린이부실',    color: '#27AE60' },
    { name: '유아부실',      color: '#8E44AD' },
    { name: '기도실 A',      color: '#F1C40F' },
    { name: '기도실 B',      color: '#16A085' },
    { name: '세미나실',      color: '#D35400' },
    { name: '도서실',        color: '#C0392B' },
    { name: '사무실',        color: '#34495E' },
  ];

  const insert = db.prepare('INSERT INTO rooms (name, color) VALUES (?, ?)');
  const insertMany = db.transaction((rows: typeof rooms) => {
    for (const r of rows) insert.run(r.name, r.color);
  });
  insertMany(rooms);
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

export function getRooms(): Room[] {
  return getDb().prepare('SELECT * FROM rooms ORDER BY id').all() as Room[];
}

export function getReservations(from?: string, to?: string): ReservationWithRoom[] {
  let sql = `
    SELECT r.*, rm.name as room_name, rm.color as room_color
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    WHERE r.status != 'rejected'
  `;
  const params: string[] = [];

  if (from) {
    sql += ' AND r.end_time >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND r.start_time <= ?';
    params.push(to);
  }

  sql += ' ORDER BY r.start_time';
  const stmt = getDb().prepare(sql);
  return (params.length === 0 ? stmt.all() : params.length === 1 ? stmt.all(params[0]) : stmt.all(params[0], params[1])) as ReservationWithRoom[];
}

export function getAllReservationsForAdmin(): ReservationWithRoom[] {
  return getDb().prepare(`
    SELECT r.*, rm.name as room_name, rm.color as room_color
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    ORDER BY r.created_at DESC
  `).all() as ReservationWithRoom[];
}

export function createReservation(data: {
  title: string;
  room_id: number;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  notes?: string;
}): Reservation {
  const stmt = getDb().prepare(`
    INSERT INTO reservations (title, room_id, start_time, end_time, person_in_charge, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.title,
    data.room_id,
    data.start_time,
    data.end_time,
    data.person_in_charge,
    data.notes ?? null
  );
  return getDb().prepare('SELECT * FROM reservations WHERE id = ?').get(result.lastInsertRowid) as Reservation;
}

export function checkConflict(room_id: number, start_time: string, end_time: string, excludeId?: number): boolean {
  const db = getDb();
  const rid = Number(room_id);

  // Overlap condition: existing.start_time < new.end_time AND existing.end_time > new.start_time
  if (excludeId !== undefined) {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM reservations
      WHERE room_id = ?
        AND status != 'rejected'
        AND start_time < ?
        AND end_time > ?
        AND id != ?
    `).get(rid, end_time, start_time, excludeId) as { c: number };
    return row.c > 0;
  } else {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM reservations
      WHERE room_id = ?
        AND status != 'rejected'
        AND start_time < ?
        AND end_time > ?
    `).get(rid, end_time, start_time) as { c: number };
    return row.c > 0;
  }
}

export function approveReservation(id: number): boolean {
  const result = getDb().prepare(
    "UPDATE reservations SET status = 'approved', rejection_reason = NULL WHERE id = ? AND status = 'pending'"
  ).run(id);
  return result.changes > 0;
}

export function rejectReservation(id: number, reason: string): boolean {
  const result = getDb().prepare(
    "UPDATE reservations SET status = 'rejected', rejection_reason = ? WHERE id = ? AND status = 'pending'"
  ).run(reason, id);
  return result.changes > 0;
}

export function deleteReservation(id: number): boolean {
  const result = getDb().prepare(
    "DELETE FROM reservations WHERE id = ? AND status = 'approved'"
  ).run(id);
  return result.changes > 0;
}
