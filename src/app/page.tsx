'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import WeekView from '@/components/WeekView';
import MonthView from '@/components/MonthView';
import DayView from '@/components/DayView';
import MiniCalendar from '@/components/MiniCalendar';
import WeekStrip from '@/components/WeekStrip';
import { ReservationWithRoom, Room } from '@/lib/db';

type ViewMode = 'day' | 'week' | 'month';
const VIEW_LABELS: Record<ViewMode, string> = { day: '일', week: '주', month: '월' };

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatDesktopTitle(viewMode: ViewMode, currentDate: Date, weekStart: Date): string {
  if (viewMode === 'day') {
    return `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일 (${DAYS_KO[currentDate.getDay()]})`;
  }
  if (viewMode === 'week') {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const s = `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일`;
    const e = weekEnd.getMonth() !== weekStart.getMonth()
      ? `${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일`
      : `${weekEnd.getDate()}일`;
    return `${s} – ${e}`;
  }
  return `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`;
}

// Mobile: Google Calendar style — show only "YYYY년 M월"
function formatMobileTitle(currentDate: Date): string {
  return `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`;
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomePage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<ReservationWithRoom[]>([]);
  const [fetchedFor, setFetchedFor] = useState<{ viewMode: ViewMode; key: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (window.innerWidth < 768) {
      setViewMode('day');
      setSidebarOpen(false);
    }
  }, []);

  const weekStart = startOfWeek(currentDate);
  const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
  // Day view fetches the full week so WeekStrip can show event dots
  const weekKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
  const fetchKey = viewMode === 'day' ? weekKey : dateKey;

  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then(setRooms).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ws = startOfWeek(currentDate);
    let from: string, to: string;

    if (viewMode === 'day') {
      // Fetch full week so WeekStrip dots work across all 7 days
      from = toLocalDateKey(ws);
      const weekEnd = new Date(ws);
      weekEnd.setDate(ws.getDate() + 7);
      to = toLocalDateKey(weekEnd);
    } else if (viewMode === 'week') {
      from = toLocalDateKey(ws);
      const weekEnd = new Date(ws);
      weekEnd.setDate(ws.getDate() + 7);
      to = toLocalDateKey(weekEnd);
    } else {
      from = toLocalDateKey(startOfMonth(currentDate));
      const firstOfNext = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      to = toLocalDateKey(firstOfNext);
    }

    async function load() {
      if (!cancelled) setLoading(true);
      try {
        const res = await fetch(`/api/reservations?from=${from}&to=${to}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          setReservations(Array.isArray(data) ? data : []);
          setFetchedFor({ viewMode, key: fetchKey });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [viewMode, fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  function goToday() { setCurrentDate(new Date()); }

  function toggleRoom(id: number) {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearFilter() { setSelectedRooms(new Set()); }

  const desktopTitle = formatDesktopTitle(viewMode, currentDate, weekStart);
  const mobileTitle = formatMobileTitle(currentDate);

  const effectiveReservations =
    fetchedFor?.viewMode === viewMode && fetchedFor?.key === fetchKey ? reservations : [];
  const filteredReservations = selectedRooms.size === 0
    ? effectiveReservations
    : effectiveReservations.filter((r) => selectedRooms.has(r.room_id));

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">

      {/* ── Top Header ── */}
      <header className="flex items-center h-16 px-2 bg-white border-b border-gray-200 flex-shrink-0 z-40">
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-2 rounded-full hover:bg-gray-100 mr-1 flex-shrink-0"
          aria-label="메뉴"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo + App name */}
        <div className="flex items-center gap-2 mr-4 flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
            </svg>
          </div>
          <span className="text-lg font-medium text-gray-800 hidden sm:block whitespace-nowrap">
            Bethel 장소예약
          </span>
        </div>

        {/* Navigation — desktop shows full date title, mobile shows month/year only */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700 flex-shrink-0 hidden md:block"
          >
            오늘
          </button>
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 flex-shrink-0"
            aria-label="이전"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 flex-shrink-0"
            aria-label="다음"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Desktop: full date title */}
          <span className="hidden md:block text-lg font-normal text-gray-700 ml-1 truncate">
            {desktopTitle}
          </span>
          {/* Mobile: compact month/year */}
          <span className="md:hidden text-base font-medium text-gray-800 ml-1 truncate">
            {mobileTitle}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {loading && (
            <span className="text-xs text-gray-400 animate-pulse hidden sm:block mr-2">
              불러오는 중...
            </span>
          )}

          {/* Admin (gear icon) */}
          <button
            onClick={() => router.push('/admin')}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
            title="관리자 모드"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* View toggle tabs */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm ml-1">
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode, i) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 font-medium transition ${i > 0 ? 'border-l border-gray-200' : ''} ${
                  viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile overlay for sidebar */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-20 bg-black/20"
            style={{ top: 64 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed drawer on mobile, inline on md+ */}
        <aside
          className={[
            'bg-white overflow-hidden flex-shrink-0 transition-all duration-200',
            'fixed left-0 bottom-0 z-30 border-r border-gray-200',
            'md:static md:top-auto md:bottom-auto md:left-auto md:z-auto',
            sidebarOpen ? 'w-64 shadow-xl md:shadow-none' : 'w-0 border-r-0',
          ].join(' ')}
          style={{ top: 64 }}
        >
          <div className="w-64 h-full overflow-y-auto flex flex-col gap-5 p-4">

            {/* Create reservation button */}
            <button
              onClick={() => router.push('/reserve')}
              className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-2xl shadow-md border border-gray-200 transition"
            >
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              장소 예약하기
            </button>

            {/* Mini Calendar */}
            <MiniCalendar
              currentDate={currentDate}
              onSelectDate={(d) => {
                setCurrentDate(d);
                setViewMode('day');
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
            />

            <hr className="border-gray-200" />

            {/* Notice */}
            <div className="text-xs text-gray-500 leading-relaxed">
              본 시스템은 소모임(사랑방, 사역팀 등) 전용입니다. 결혼식 등 큰 행사는{' '}
              <a
                href="https://drive.google.com/drive/folders/1lz7kaoe8GQf2FZI1Dfb-3hDEEWpFgygj"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                사용신청서(클릭)
              </a>
              를 이용해 주세요.
            </div>

            {/* Legend */}
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                범례
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-sm bg-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-600">확정</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-sm reservation-pending flex-shrink-0"
                    style={{ backgroundColor: '#94a3b8' }}
                  />
                  <span className="text-sm text-gray-600">승인 대기</span>
                </div>
              </div>
            </div>

            {/* Room filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  장소 필터
                </span>
                {selectedRooms.size > 0 && (
                  <button onClick={clearFilter} className="text-xs text-blue-600 hover:underline">
                    전체 보기
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {rooms.map((room) => {
                  const selected = selectedRooms.has(room.id);
                  return (
                    <button
                      key={room.id}
                      onClick={() => toggleRoom(room.id)}
                      className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-gray-100 text-left transition"
                    >
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                          backgroundColor: selected ? room.color : 'transparent',
                          border: `2px solid ${room.color}`,
                        }}
                      >
                        {selected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-sm truncate ${selected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                        {room.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </aside>

        {/* Main content column */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/*
            ── Mobile Week Strip (Google Calendar style) ──
            Shown only on mobile (<md), only in day view.
            Lets users tap a day in the current week to navigate.
          */}
          {viewMode === 'day' && (
            <div className="md:hidden flex-shrink-0">
              <WeekStrip
                weekStart={weekStart}
                selectedDate={currentDate}
                reservations={effectiveReservations}
                onSelectDate={(d) => setCurrentDate(d)}
              />
            </div>
          )}

          {/* Calendar */}
          <main className="flex-1 overflow-hidden">
            {viewMode === 'day' ? (
              <DayView key="day" currentDate={currentDate} reservations={filteredReservations} />
            ) : viewMode === 'week' ? (
              <WeekView key="week" weekStart={weekStart} reservations={filteredReservations} />
            ) : (
              <div key="month" className="h-full overflow-y-auto calendar-scroll">
                <MonthView currentDate={currentDate} reservations={filteredReservations} />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile FAB — 예약 신청 */}
      <button
        onClick={() => router.push('/reserve')}
        className="md:hidden fixed bottom-6 right-4 w-14 h-14 bg-white shadow-lg rounded-2xl flex items-center justify-center z-10 border border-gray-200"
        aria-label="예약 신청"
      >
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
