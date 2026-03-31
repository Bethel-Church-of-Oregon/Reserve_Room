'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import ReservationDetailPopover, { CancelRequestModal } from './ReservationDetailPopover';

const HOUR_START = 6;   // 6am
const HOUR_END = 23;    // 11pm
const TOTAL_HOURS = HOUR_END - HOUR_START;
const PX_PER_MIN = 1.5; // 1.5px per minute
const PX_PER_HOUR = PX_PER_MIN * 60;
const TOTAL_HEIGHT = TOTAL_HOURS * PX_PER_HOUR;

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];


interface Props {
  weekStart: Date;
  reservations: ReservationWithRoom[];
  onRefresh?: () => void;
  swipeOffset?: number;
  swipeDragging?: boolean;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getReservationsForDay(reservations: ReservationWithRoom[], day: Date): ReservationWithRoom[] {
  const key = dateKey(day);
  return reservations.filter((r) => {
    const startDate = r.start_time.slice(0, 10);
    return startDate === key;
  });
}

// Simple overlap grouping to position side-by-side
function groupOverlapping(items: ReservationWithRoom[]): Array<{ item: ReservationWithRoom; col: number; totalCols: number }> {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const result: Array<{ item: ReservationWithRoom; col: number; totalCols: number }> = [];
  const cols: number[] = []; // end time (in minutes) of last item in each column

  for (const item of sorted) {
    const startMin = timeToMinutes(item.start_time);
    const endMin = timeToMinutes(item.end_time);

    let col = cols.findIndex((endM) => endM <= startMin);
    if (col === -1) {
      col = cols.length;
      cols.push(endMin);
    } else {
      cols[col] = endMin;
    }

    result.push({ item, col, totalCols: 0 });
  }

  // Compute totalCols for overlapping groups
  for (let i = 0; i < result.length; i++) {
    const startMin = timeToMinutes(result[i].item.start_time);
    const endMin = timeToMinutes(result[i].item.end_time);
    let maxCol = result[i].col;

    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      const sMin = timeToMinutes(result[j].item.start_time);
      const eMin = timeToMinutes(result[j].item.end_time);
      if (sMin < endMin && eMin > startMin) {
        maxCol = Math.max(maxCol, result[j].col);
      }
    }

    result[i].totalCols = maxCol + 1;
  }

  return result;
}

export default function WeekView({ weekStart, reservations, onRefresh, swipeOffset = 0, swipeDragging = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && timeLabelRef.current) {
      timeLabelRef.current.style.top = `-${scrollRef.current.scrollTop}px`;
    }
  }, []);
  const days = getWeekDays(weekStart);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - HOUR_START) * PX_PER_HOUR - 20;
    }
  }, []);

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="w-14 flex-shrink-0" />
        {days.map((day, idx) => {
          const key = dateKey(day);
          const isToday = key === today;
          return (
            <div
              key={idx}
              className={`flex-1 text-center py-2 text-sm font-medium ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-700'
              }`}
            >
              <div className={`inline-flex flex-col items-center gap-1 ${isToday ? 'text-white' : ''}`}>
                <span className="text-xs text-gray-500">
                  {DAYS_KO[day.getDay()]}
                </span>
                <span
                  className={`text-base font-bold w-8 h-8 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : ''
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 min-h-0">
        {/* Time labels — fixed, synchronized via onScroll */}
        <div className="w-14 flex-shrink-0 relative overflow-hidden bg-white z-10">
          <div ref={timeLabelRef} className="absolute w-full" style={{ top: 0, height: TOTAL_HEIGHT }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute text-xs text-gray-400 text-right pr-2 -translate-y-2"
                style={{ top: (h - HOUR_START) * PX_PER_HOUR, width: '100%' }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto calendar-scroll overflow-x-hidden" onScroll={handleScroll}>
        <div
          className="flex"
          style={{
            height: TOTAL_HEIGHT,
            transform: `translateX(${swipeOffset}px)`,
            transition: swipeDragging ? 'none' : 'transform 0.22s ease-out',
            willChange: 'transform',
          }}
        >
          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const dayReservations = getReservationsForDay(reservations, day);
            const grouped = groupOverlapping(dayReservations);
            const key = dateKey(day);
            const isToday = key === today;

            return (
              <div
                key={dayIdx}
                className={`flex-1 relative border-l border-gray-100 ${isToday ? 'bg-blue-50/30' : ''}`}
                style={{ height: TOTAL_HEIGHT }}
              >
                {/* Hour grid lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-gray-100"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR }}
                  />
                ))}
                {/* Half-hour lines */}
                {hours.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute w-full border-t border-gray-50"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                  />
                ))}

                {/* Reservation blocks */}
                {grouped.map(({ item, col, totalCols }) => {
                  const startMin = timeToMinutes(item.start_time) - HOUR_START * 60;
                  const endMin = timeToMinutes(item.end_time) - HOUR_START * 60;
                  const top = Math.max(0, startMin * PX_PER_MIN);
                  const height = Math.max(20, (endMin - startMin) * PX_PER_MIN - 2);
                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;
                  return (
                    <div
                      key={item.id}
                      className="absolute rounded text-white text-xs px-1 py-0.5 overflow-hidden cursor-default"
                      style={{
                        top,
                        height,
                        left: `${leftPct + 0.5}%`,
                        width: `${widthPct - 1}%`,
                        backgroundColor: item.room_color,
                        zIndex: 2,
                      }}
                      onMouseEnter={(e) => showPopover(item, e.currentTarget)}
                      onMouseLeave={() => hidePopover(80)}
                    >
                      <div className="font-semibold leading-tight truncate">{item.title}</div>
                      {height > 30 && (
                        <div className="truncate opacity-90" style={{ fontSize: '10px' }}>
                          {item.room_name}
                        </div>
                      )}
                      {height > 44 && (
                        <div className="truncate opacity-80" style={{ fontSize: '10px' }}>
                          {formatTime(item.start_time)}–{formatTime(item.end_time)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>{/* end scrollable events */}
      </div>{/* end flex row */}

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

