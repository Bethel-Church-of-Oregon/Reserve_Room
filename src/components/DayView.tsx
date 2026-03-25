'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import ReservationDetailPopover, { CancelRequestModal } from './ReservationDetailPopover';

const HOUR_START = 6;
const HOUR_END = 23;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const PX_PER_MIN = 1.5;
const PX_PER_HOUR = PX_PER_MIN * 60;
const TOTAL_HEIGHT = TOTAL_HOURS * PX_PER_HOUR;

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function getPacificNow(): { totalMinutes: number; dateKey: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const h = parseInt(get('hour'));
  const m = parseInt(get('minute'));
  return {
    totalMinutes: h * 60 + m,
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(d: Date): Date[] {
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + i);
    return date;
  });
}

interface Props {
  currentDate: Date;
  reservations: ReservationWithRoom[];
  onDayClick?: (date: Date) => void;
  onRefresh?: () => void;
  swipeOffset?: number;
  swipeDragging?: boolean;
}

function timeToMinutes(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupOverlapping(items: ReservationWithRoom[]): Array<{ item: ReservationWithRoom; col: number; totalCols: number }> {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const result: Array<{ item: ReservationWithRoom; col: number; totalCols: number }> = [];
  const cols: number[] = [];

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

export default function DayView({ currentDate, reservations, onDayClick, onRefresh, swipeOffset = 0, swipeDragging = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && timeLabelRef.current) {
      timeLabelRef.current.style.top = `-${scrollRef.current.scrollTop}px`;
    }
  }, []);
  const dayKey = toLocalDateKey(currentDate);
  const dayReservations = reservations.filter((r) => r.start_time.slice(0, 10) === dayKey);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);
  const grouped = groupOverlapping(dayReservations);

  const isToday = dayKey === toLocalDateKey(new Date());
  const weekDays = getWeekDays(currentDate);
  const today = toLocalDateKey(new Date());

  const [hovered, setHovered] = useState<{ reservation: ReservationWithRoom; rect: DOMRect } | null>(null);
  const [cancelModalReservation, setCancelModalReservation] = useState<ReservationWithRoom | null>(null);
  const [pacificNow, setPacificNow] = useState(getPacificNow);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setPacificNow(getPacificNow()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className="flex flex-col h-full">
      {/* Week strip + date label — sticky, outside swipe transform */}
      <div className="sticky top-0 z-30 bg-white">

      {/* Week strip */}
      <div className="flex border-b border-gray-200">
        <div className="w-14 flex-shrink-0" />
        {weekDays.map((day, idx) => {
          const key = toLocalDateKey(day);
          const isSelected = key === dayKey;
          const isTodayDay = key === today;
          const hasDot = reservations.some((r) => r.start_time.slice(0, 10) === key);
          return (
            <div
              key={idx}
              className={`flex-1 text-center py-2 cursor-pointer hover:bg-gray-50 transition ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-700'
              }`}
              onClick={() => onDayClick?.(day)}
            >
              <div className="inline-flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{DAYS_KO[day.getDay()]}</span>
                <span
                  className={`text-base font-bold w-8 h-8 flex items-center justify-center rounded-full ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isTodayDay
                      ? 'bg-blue-100 text-blue-600'
                      : ''
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className={`mt-1 w-1.5 h-1.5 rounded-full ${hasDot ? 'bg-gray-400' : 'invisible'}`} />
              </div>
            </div>
          );
        })}
      </div>


</div>{/* end sticky wrapper */}

      {/* Scrollable body — time labels fixed left, events scroll */}
      <div className="flex flex-1 min-h-0">
        {/* Time labels — fixed, synchronized via onScroll DOM manipulation */}
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
        <div style={{ height: TOTAL_HEIGHT }}>
          {/* Single day column — swipe transform applied here only */}
          <div
            className={`flex-1 relative border-l border-gray-100 ${isToday ? 'bg-blue-50/30' : ''}`}
            style={{
              height: TOTAL_HEIGHT,
              transform: `translateX(${swipeOffset}px)`,
              transition: swipeDragging ? 'none' : 'transform 0.22s ease-out',
              willChange: 'transform',
            }}
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

            {/* Current time line */}
            {dayKey === pacificNow.dateKey &&
              pacificNow.totalMinutes >= HOUR_START * 60 &&
              pacificNow.totalMinutes <= HOUR_END * 60 && (() => {
                const top = (pacificNow.totalMinutes - HOUR_START * 60) * PX_PER_MIN;
                return (
                  <div className="absolute w-full" style={{ top, zIndex: 10, pointerEvents: 'none' }}>
                    <div className="relative flex items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 -ml-1" />
                      <div className="flex-1 border-t-2 border-blue-500" />
                    </div>
                  </div>
                );
              })()}

            {/* Reservation blocks */}
            {grouped.map(({ item, col, totalCols }) => {
              const startMin = timeToMinutes(item.start_time) - HOUR_START * 60;
              const endMin = timeToMinutes(item.end_time) - HOUR_START * 60;
              const top = Math.max(0, startMin * PX_PER_MIN);
              const height = Math.max(20, (endMin - startMin) * PX_PER_MIN - 2);
              const widthPct = 100 / totalCols;
              const leftPct = col * widthPct;
              const isPending = item.status === 'pending' || item.status === 'cancellation_requested';

              return (
                <div
                  key={item.id}
                  className={`absolute rounded text-white text-xs px-1.5 py-1 overflow-hidden cursor-default ${
                    isPending ? 'reservation-pending opacity-80' : ''
                  }`}
                  style={{
                    top,
                    height,
                    left: `${leftPct + 0.5}%`,
                    width: `${widthPct - 1}%`,
                    backgroundColor: item.room_color,
                    border: isPending ? `2px dashed ${item.room_color}` : 'none',
                    zIndex: isPending ? 1 : 2,
                  }}
                  onMouseEnter={(e) => showPopover(item, e.currentTarget)}
                  onMouseLeave={() => hidePopover(80)}
                >
                  <div className="font-semibold leading-tight truncate">{item.title}</div>
                  {height > 24 && (
                    <div className="truncate opacity-90" style={{ fontSize: '10px' }}>
                      {item.room_name}
                    </div>
                  )}
                  {height > 40 && (
                    <div className="truncate opacity-80" style={{ fontSize: '10px' }}>
                      {formatTime(item.start_time)}–{formatTime(item.end_time)}
                    </div>
                  )}
                  {height > 56 && (
                    <div className="truncate opacity-70" style={{ fontSize: '10px' }}>
                      {item.person_in_charge}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>{/* end scrollable events */}
      </div>{/* end flex row (time labels + events) */}

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
