'use client';

import React, { useState, useEffect } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import { CancelRequestModal } from './ReservationDetailPopover';

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
  const [cancelModalReservation, setCancelModalReservation] = useState<ReservationWithRoom | null>(null);
  const [expandedDay, setExpandedDay] = useState<{ date: Date; reservations: ReservationWithRoom[] } | null>(null);
  const [selectedModalId, setSelectedModalId] = useState<string | null>(null);
  const [maxShow, setMaxShow] = useState(3);
  useEffect(() => {
    const update = () => setMaxShow(window.innerHeight > window.innerWidth ? 4 : 3);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
      <div className="flex-1 overflow-y-auto grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0" style={{ minHeight: '130px' }}>
            {week.map((day, di) => {
              const key = dateKey(day);
              const isCurrentMonth = day.getMonth() === month;
              const isToday = key === today;
              const dayReservations = reservationsByDay.get(key) ?? [];
              const shown = dayReservations.slice(0, maxShow);
              const extra = dayReservations.length - maxShow;

              return (
                <div
                  key={di}
                  className={`border-l border-gray-100 first:border-l-0 p-1 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                  } ${isToday ? 'bg-blue-50 hover:bg-blue-100' : ''}`}
                  onClick={() => setExpandedDay({ date: day, reservations: dayReservations })}
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
                          className={`text-white text-xs px-1 rounded truncate h-3 sm:h-auto sm:leading-5 ${
                            isPending ? 'reservation-pending opacity-80' : ''
                          }`}
                          style={{
                            backgroundColor: r.room_color,
                            border: isPending ? `1px dashed ${r.room_color}` : 'none',
                          }}
                        >
                          <span className="hidden sm:inline font-medium">{formatTime(r.start_time)}</span>
                          <span className="hidden sm:inline truncate"> {r.title}</span>
                        </div>
                      );
                    })}
                    {extra > 0 && (
                      <div className="text-xs text-gray-400 pl-1">+{extra}개</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day detail modal */}
      {expandedDay && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120] px-4"
          onClick={() => { setExpandedDay(null); setSelectedModalId(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">
                {expandedDay.date.getFullYear()}년 {expandedDay.date.getMonth() + 1}월 {expandedDay.date.getDate()}일 ({DAYS_KO[expandedDay.date.getDay()]})
              </h3>
              <button
                type="button"
                onClick={() => { setExpandedDay(null); setSelectedModalId(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {expandedDay.reservations.length === 0 && (
                <div className="flex items-center justify-center h-24 text-sm text-gray-400">해당 일자에는 예약이 없습니다.</div>
              )}
              {expandedDay.reservations
                .slice()
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map((r) => {
                  const isPending = r.status === 'pending' || r.status === 'cancellation_requested';
                  const isCancelRequested = r.status === 'cancellation_requested';
                  const canRequestCancel = (r.status === 'pending' || r.status === 'approved') && !isCancelRequested && r.end_time.slice(0, 10) >= today;
                  const isSelected = selectedModalId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedModalId(isSelected ? null : r.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        isSelected ? 'border-gray-300 bg-gray-200' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className="mt-0.5 shrink-0 w-3 h-3 rounded-sm"
                        style={{ backgroundColor: r.room_color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm text-gray-800 truncate">{r.title}</div>
                          <span
                            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              isPending
                                ? isCancelRequested ? 'bg-amber-100 text-amber-800' : 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {isPending ? (isCancelRequested ? '취소 대기중' : '승인 대기중') : '예약 확정'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{r.room_name}</div>
                        <div className="text-xs text-gray-500">{formatTime(r.start_time)} – {formatTime(r.end_time)}</div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">담당: {r.person_in_charge}</div>
                          {isSelected && canRequestCancel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDay(null);
                                setSelectedModalId(null);
                                setCancelModalReservation(r);
                              }}
                              className="text-[10px] font-medium px-1.5 py-0.5 text-red-600 border border-red-200 rounded hover:bg-red-50 transition"
                            >
                              취소 신청하기
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
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
