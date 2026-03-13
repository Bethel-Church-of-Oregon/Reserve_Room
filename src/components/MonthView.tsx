'use client';

import React, { useState, useRef } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import ReservationDetailPopover, { CancelRequestModal } from './ReservationDetailPopover';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  currentDate: Date;
  reservations: ReservationWithRoom[];
  onRefresh?: () => void;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const endDow = lastDay.getDay();

  const days: Date[] = [];

  // Fill leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Fill trailing days to complete the last week
  const remaining = 6 - endDow;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

export default function MonthView({ currentDate, reservations, onRefresh }: Props) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const calDays = getCalendarDays(year, month);
  const today = dateKey(new Date());
  const [hovered, setHovered] = useState<{ reservation: ReservationWithRoom; rect: DOMRect } | null>(null);
  const [cancelModalReservation, setCancelModalReservation] = useState<ReservationWithRoom | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopover = (reservation: ReservationWithRoom, el: HTMLElement) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHovered({ reservation, rect: el.getBoundingClientRect() });
  };

  const hidePopover = (delay = 0) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (delay > 0) {
      hideTimeoutRef.current = setTimeout(() => setHovered(null), delay);
    } else {
      setHovered(null);
    }
  };

  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const reservationsByDay = new Map<string, ReservationWithRoom[]>();
  for (const r of reservations) {
    const key = r.start_time.slice(0, 10);
    if (!reservationsByDay.has(key)) reservationsByDay.set(key, []);
    reservationsByDay.get(key)!.push(r);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < calDays.length; i += 7) {
    weeks.push(calDays.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS_KO.map((d, i) => (
          <div
            key={d}
            className={`text-center py-2 text-sm font-medium ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0" style={{ minHeight: '100px' }}>
            {week.map((day, di) => {
              const key = dateKey(day);
              const isCurrentMonth = day.getMonth() === month;
              const isToday = key === today;
              const dayReservations = reservationsByDay.get(key) ?? [];
              const MAX_SHOW = 3;
              const shown = dayReservations.slice(0, MAX_SHOW);
              const extra = dayReservations.length - MAX_SHOW;

              return (
                <div
                  key={di}
                  className={`border-l border-gray-100 first:border-l-0 p-1 ${
                    isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                  } ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex justify-end mb-1">
                    <span
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : isCurrentMonth
                          ? di === 0 ? 'text-red-500' : di === 6 ? 'text-blue-500' : 'text-gray-700'
                          : 'text-gray-300'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {shown.map((r) => {
                      const isPending = r.status === 'pending' || r.status === 'cancellation_requested';
                      return (
                        <div
                          key={r.id}
                          className={`text-white text-xs px-1 rounded truncate leading-5 cursor-default ${
                            isPending ? 'reservation-pending opacity-80' : ''
                          }`}
                          style={{
                            backgroundColor: r.room_color,
                            border: isPending ? `1px dashed ${r.room_color}` : 'none',
                          }}
                          onMouseEnter={(e) => showPopover(r, e.currentTarget)}
                          onMouseLeave={() => hidePopover(80)}
                        >
                          <span className="font-medium">{formatTime(r.start_time)}</span>{' '}
                          <span className="truncate">{r.title}</span>
                        </div>
                      );
                    })}
                    {extra > 0 && (
                      <div className="text-xs text-gray-400 pl-1">+{extra}개 더</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {hovered && (
        <ReservationDetailPopover
          reservation={hovered.reservation}
          position={{ top: hovered.rect.top, left: hovered.rect.left }}
          onMouseEnter={cancelHide}
          onMouseLeave={() => hidePopover(80)}
          onRequestCancel={(r) => setCancelModalReservation(r)}
        />
      )}

      {cancelModalReservation && (
        <CancelRequestModal
          reservation={cancelModalReservation}
          onConfirm={() => {
            setCancelModalReservation(null);
            onRefresh?.();
          }}
          onCancel={() => setCancelModalReservation(null)}
        />
      )}
    </div>
  );
}
