'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import WeekView from '@/components/WeekView';
import MonthView from '@/components/MonthView';
import { ReservationWithRoom, Room } from '@/lib/db';

type ViewMode = 'week' | 'month';

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMonthTitle(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function formatWeekTitle(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const s = `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일`;
  const e = weekEnd.getMonth() !== weekStart.getMonth()
    ? `${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일`
    : `${weekEnd.getDate()}일`;
  return `${s} – ${e}`;
}

export default function HomePage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<ReservationWithRoom[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(currentDate);

  // String key for stable effect dependency (avoids Date object reference issues)
  const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;

  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then(setRooms).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ws = startOfWeek(currentDate);
    let from: string, to: string;

    if (viewMode === 'week') {
      from = ws.toISOString().slice(0, 10);
      const weekEnd = new Date(ws);
      weekEnd.setDate(ws.getDate() + 7);
      to = weekEnd.toISOString().slice(0, 10);
    } else {
      from = startOfMonth(currentDate).toISOString().slice(0, 10);
      const me = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      to = me.toISOString().slice(0, 10);
    }

    async function load() {
      if (!cancelled) setLoading(true);
      try {
        const res = await fetch(`/api/reservations?from=${from}&to=${to}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setReservations(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('fetch reservations error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [viewMode, dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'week') {
        d.setDate(d.getDate() + dir * 7);
      } else {
        d.setMonth(d.getMonth() + dir);
      }
      return d;
    });
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const title = viewMode === 'week' ? formatWeekTitle(weekStart) : formatMonthTitle(currentDate);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          {/* Logo / Title */}
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-lg sm:text-xl font-bold text-blue-700">오레곤벧엘장로교회 장소예약시스템</span>

          </div>

          {/* Right buttons */}
          <button
            onClick={() => router.push('/reserve')}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            + 장소 예약 신청
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition"
          >
            관리자 모드
          </button>
        </div>
      </header>

      {/* Notice banner */}
      <div className="bg-blue-50 border-b border-blue-100 px-3 sm:px-6 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-2 text-sm text-blue-800">
          <span>본 예약시스템은 사랑방 모임, 사역팀 회의, 친교 등을 위한 것으로, 결혼식 등 큰 행사는</span>
          <a
            href="https://drive.google.com/drive/folders/1lz7kaoe8GQf2FZI1Dfb-3hDEEWpFgygj"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition whitespace-nowrap"
          >
            사용신청서 작성
          </a>
          <span>을 클릭하여 제출해 주시기 바랍니다.</span>
        </div>
      </div>

      {/* Calendar controls */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 font-medium transition ${
                viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              주간
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${
                viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              월간
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition"
              aria-label="이전"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 text-gray-700 transition"
            >
              오늘
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition"
              aria-label="다음"
            >
              ›
            </button>
          </div>

          <span className="text-sm font-semibold text-gray-700 ml-1">{title}</span>

          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1">
              <span className="w-8 h-3 rounded-sm bg-gray-500" />
              <span className="text-xs text-gray-500">확정</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="w-8 h-3 rounded-sm reservation-pending"
                style={{ backgroundColor: '#94a3b8' }}
              />
              <span className="text-xs text-gray-500">승인 대기</span>
            </div>
            {loading && (
              <span className="text-xs text-gray-400 animate-pulse">불러오는 중...</span>
            )}
          </div>
        </div>
      </div>

      {/* Room legend */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="text-xs text-gray-500 font-medium mr-1">장소:</span>
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: room.color }}
              />
              <span className="text-xs text-gray-600">{room.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-screen-2xl mx-auto h-full px-0 sm:px-2">
          <div
            className="bg-white border border-gray-200 rounded-none sm:rounded-lg shadow-sm overflow-hidden"
            style={{ height: 'calc(100vh - 170px)' }}
          >
            {viewMode === 'week' ? (
              <WeekView weekStart={weekStart} reservations={reservations} />
            ) : (
              <div className="h-full overflow-y-auto calendar-scroll">
                <MonthView currentDate={currentDate} reservations={reservations} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
