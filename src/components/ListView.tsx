'use client';

import React, { useState } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import { CancelRequestModal } from './ReservationDetailPopover';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const hour = h % 12 || 12;
  return `${period} ${hour}:${m.toString().padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekLabel(weekStartKey: string): string {
  const d = new Date(weekStartKey + 'T00:00:00');
  const we = new Date(d);
  we.setDate(d.getDate() + 6);
  const startStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  const endStr =
    we.getMonth() !== d.getMonth()
      ? `${we.getMonth() + 1}월 ${we.getDate()}일`
      : `${we.getDate()}일`;
  return `${startStr} – ${endStr}`;
}

interface Props {
  reservations: ReservationWithRoom[];
  loading: boolean;
  onRefresh?: () => void;
}

export default function ListView({ reservations, loading, onRefresh }: Props) {
  const today = toLocalDateKey(new Date());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cancelModalReservation, setCancelModalReservation] = useState<ReservationWithRoom | null>(null);

  const upcoming = [...reservations]
    .filter((r) => r.start_time.slice(0, 10) >= today && r.status !== 'rejected')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Group by date
  const byDate = new Map<string, ReservationWithRoom[]>();
  for (const r of upcoming) {
    const key = r.start_time.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r);
  }

  // Group date keys by week
  type WeekGroup = { weekKey: string; dates: string[] };
  const weeks: WeekGroup[] = [];
  let currentWeek: WeekGroup | null = null;

  for (const dateKey of Array.from(byDate.keys())) {
    const date = new Date(dateKey + 'T00:00:00');
    const wsKey = toLocalDateKey(startOfWeek(date));
    if (!currentWeek || currentWeek.weekKey !== wsKey) {
      currentWeek = { weekKey: wsKey, dates: [] };
      weeks.push(currentWeek);
    }
    currentWeek.dates.push(dateKey);
  }

  if (loading && upcoming.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        불러오는 중...
      </div>
    );
  }

  if (!loading && upcoming.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        예정된 예약이 없습니다.
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-y-auto h-full calendar-scroll"
        onClick={(e) => {
          // Deselect when clicking outside a card
          if ((e.target as HTMLElement).closest('[data-card]') === null) setSelectedId(null);
        }}
      >
        {weeks.map((week) => (
          <div key={week.weekKey}>
            {/* Week header */}
            <div className="bg-gray-50 border-y border-gray-200 px-4 py-1.5">
              <span className="text-xs font-semibold text-gray-500">{formatWeekLabel(week.weekKey)}</span>
            </div>

            {/* Date rows */}
            {week.dates.map((dateKey) => {
              const date = new Date(dateKey + 'T00:00:00');
              const isToday = dateKey === today;
              const items = byDate.get(dateKey)!;

              return (
                <div key={dateKey} className="flex border-b border-gray-100 px-4 py-3 gap-4">
                  {/* Date column */}
                  <div className="flex flex-col items-center w-10 flex-shrink-0 pt-0.5">
                    <span className={`text-2xl font-bold leading-none ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      {date.getDate()}
                    </span>
                    <span className={`text-xs mt-1 ${isToday ? 'text-blue-500' : 'text-gray-400'}`}>
                      {DAYS_KO[date.getDay()]}
                    </span>
                  </div>

                  {/* Reservation cards */}
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    {items.map((item) => {
                      const isPending = item.status === 'pending';
                      const isCancelReq = item.status === 'cancellation_requested';
                      const isSelected = selectedId === item.id;
                      const canRequestCancel =
                        (item.status === 'pending' || item.status === 'approved') &&
                        item.end_time.slice(0, 10) >= today;

                      return (
                        <div
                          key={item.id}
                          data-card="true"
                          onClick={() => setSelectedId(isSelected ? null : item.id)}
                          className={`rounded-lg px-3 py-2 border-l-[5px] cursor-pointer transition-colors ${
                            isSelected ? 'bg-gray-200' : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                          style={{ borderLeftColor: item.room_color }}
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <span className="font-semibold text-gray-800 text-sm truncate">{item.title}</span>
                            {isPending ? (
                              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 whitespace-nowrap">
                                승인 대기중
                              </span>
                            ) : isCancelReq ? (
                              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
                                취소 대기중
                              </span>
                            ) : (
                              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                                예약 확정
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 flex flex-col gap-y-0.5">
                            <span>{formatTime(item.start_time)} – {formatTime(item.end_time)}</span>
                            <div className="flex items-center justify-between gap-2">
                              <span>{item.room_name}</span>
                              {isSelected && canRequestCancel && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelModalReservation(item);
                                  }}
                                  className="text-xs px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50 transition whitespace-nowrap"
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
              );
            })}
          </div>
        ))}
      </div>

      {cancelModalReservation && (
        <CancelRequestModal
          reservation={cancelModalReservation}
          onConfirm={() => {
            setCancelModalReservation(null);
            setSelectedId(null);
            onRefresh?.();
          }}
          onCancel={() => setCancelModalReservation(null)}
        />
      )}
    </>
  );
}
