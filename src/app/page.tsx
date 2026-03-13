'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import WeekView from '@/components/WeekView';
import MonthView from '@/components/MonthView';
import DayView from '@/components/DayView';
import { ReservationWithRoom, Room } from '@/lib/db';

type ViewMode = 'day' | 'week' | 'month';

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

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
function formatDayTitle(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
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

  useEffect(() => {
    if (window.innerWidth < 640) setViewMode('day');
  }, []);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<ReservationWithRoom[]>([]);
  const [fetchedFor, setFetchedFor] = useState<{ viewMode: ViewMode; dateKey: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const weekStart = startOfWeek(currentDate);

  // String key for stable effect dependency (avoids Date object reference issues)
  const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;

  const refreshReservations = () => setRefreshTrigger((t) => t + 1);

  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then(setRooms).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ws = startOfWeek(currentDate);
    let from: string, to: string;

    if (viewMode === 'day') {
      from = currentDate.toISOString().slice(0, 10);
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);
      to = nextDay.toISOString().slice(0, 10);
    } else if (viewMode === 'week') {
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
        if (!cancelled) {
          setReservations(Array.isArray(data) ? data : []);
          setFetchedFor({ viewMode, dateKey });
        }
      } catch (e) {
        console.error('fetch reservations error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [viewMode, dateKey, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'day') {
        d.setDate(d.getDate() + dir);
      } else if (viewMode === 'week') {
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

  const title = viewMode === 'day' ? formatDayTitle(currentDate) : viewMode === 'week' ? formatWeekTitle(weekStart) : formatMonthTitle(currentDate);

  function toggleRoom(id: number) {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilter() {
    setSelectedRooms(new Set());
  }

  const effectiveReservations =
    fetchedFor?.viewMode === viewMode && fetchedFor?.dateKey === dateKey ? reservations : [];
  const filteredReservations = selectedRooms.size === 0
    ? effectiveReservations
    : effectiveReservations.filter((r) => selectedRooms.has(r.room_id));

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          {/* Logo / Title */}
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <span className="text-base sm:text-xl font-bold text-blue-700 truncate">
              <span className="hidden sm:inline"></span>Bethel 장소예약시스템
            </span>
          </div>

          {/* Right buttons */}
          <button
            onClick={() => router.push('/reserve')}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
          >
            <span className="hidden sm:inline">+ 장소 예약 신청</span>
            <span className="sm:hidden">+ 예약</span>
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
          >
            <span className="hidden sm:inline">관리자 모드</span>
            <span className="sm:hidden">관리자</span>
          </button>
        </div>
      </header>

      {/* Notice banner */}
      <div className="bg-blue-50 border-b border-blue-100 px-3 sm:px-6 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-2 text-xs sm:text-sm text-blue-800">
          <span className="hidden sm:inline">본 시스템은 소모임(사랑방, 사역팀 등) 전용 입니다. 결혼식 등 대규모 행사는</span>
          <span className="sm:hidden">소모임(사랑방, 사역팀 등) 전용 입니다. 결혼식 등 대규모 행사는</span>
          <a
            href="https://drive.google.com/drive/folders/1lz7kaoe8GQf2FZI1Dfb-3hDEEWpFgygj"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition whitespace-nowrap"
          >
            사용신청서 작성
          </a>
          <span>을 이용해 주세요.</span>
        </div>
      </div>

      {/* Calendar controls */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 font-medium transition ${
                viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              일간
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${
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
              <span className="text-xs text-gray-500">승인 대기 / 취소 신청 대기</span>
            </div>
            {loading && (
              <span className="text-xs text-gray-400 animate-pulse">불러오는 중...</span>
            )}
          </div>
        </div>
      </div>

      {/* Room legend / filter */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6">
        {/* Toggle header */}
        <div className="max-w-screen-2xl mx-auto flex items-center gap-2 py-2">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              legendOpen
                ? 'bg-gray-100 border-gray-300 text-gray-800'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            장소 필터
            {selectedRooms.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs leading-none">
                {selectedRooms.size}
              </span>
            )}
            <span className="text-gray-400">{legendOpen ? '접기' : '열기'}</span>
          </button>
          {selectedRooms.size > 0 && (
            <button
              onClick={clearFilter}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition"
            >
              전체 보기
            </button>
          )}
        </div>

        {/* Collapsible room list */}
        {legendOpen && (
          <div className="max-w-screen-2xl mx-auto pb-2 flex flex-wrap gap-x-2 gap-y-1.5">
            {rooms.map((room) => {
              const selected = selectedRooms.has(room.id);
              return (
                <button
                  key={room.id}
                  onClick={() => toggleRoom(room.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition ${
                    selected
                      ? 'border-transparent text-white font-medium'
                      : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                  style={selected ? { backgroundColor: room.color, borderColor: room.color } : {}}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: selected ? 'rgba(255,255,255,0.7)' : room.color }}
                  />
                  {room.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-screen-2xl mx-auto h-full px-0 sm:px-2">
          <div
            className="bg-white border border-gray-200 rounded-none sm:rounded-lg shadow-sm overflow-hidden"
            style={{ height: 'calc(100vh - 170px)' }}
          >
            {viewMode === 'day' ? (
              <DayView currentDate={currentDate} reservations={filteredReservations} onRefresh={refreshReservations} />
            ) : viewMode === 'week' ? (
              <WeekView weekStart={weekStart} reservations={filteredReservations} onRefresh={refreshReservations} />
            ) : (
              <div className="h-full overflow-y-auto calendar-scroll">
                <MonthView currentDate={currentDate} reservations={filteredReservations} onRefresh={refreshReservations} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
