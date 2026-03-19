'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// Use local date components (avoid timezone shift from toISOString)
function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const weekStart = startOfWeek(currentDate);
  const refreshReservations = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  const calendarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeLocked = useRef<'horizontal' | 'vertical' | null>(null);
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });

  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      swipeLocked.current = null;
    }

    function onTouchMove(e: TouchEvent) {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      if (!swipeLocked.current) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          swipeLocked.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
      }

      if (swipeLocked.current === 'horizontal') {
        e.preventDefault();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      touchStartY.current = null;
      if (swipeLocked.current !== 'horizontal') return;
      swipeLocked.current = null;
      if (Math.abs(dx) < 70) return;
      navigateRef.current(dx < 0 ? 1 : -1);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // String key for stable effect dependency (avoids Date object reference issues)
  const dateKey = toLocalDateKey(currentDate);

  useEffect(() => {
    setRoomsError(null);
    fetch('/api/rooms')
      .then((r) => {
        if (!r.ok) throw new Error('장소 목록을 불러오지 못했습니다.');
        return r.json();
      })
      .then(setRooms)
      .catch((e) => {
        console.error('rooms fetch error:', e);
        setRoomsError(e instanceof Error ? e.message : '장소 목록을 불러오지 못했습니다.');
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ws = startOfWeek(currentDate);
    let from: string, to: string;

    if (viewMode === 'day') {
      // Fetch the full week so the week strip dots can be populated
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
      if (!cancelled) {
        setLoading(true);
        setReservationsError(null);
      }
      try {
        const res = await fetch(`/api/reservations?from=${from}&to=${to}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          if (!res.ok) {
            setReservationsError(typeof data?.error === 'string' ? data.error : '예약 목록을 불러오지 못했습니다.');
            setReservations([]);
          } else {
            setReservations(Array.isArray(data) ? data : []);
            setFetchedFor({ viewMode, dateKey: viewMode === 'day' ? from : dateKey });
          }
        }
      } catch (e) {
        console.error('fetch reservations error:', e);
        if (!cancelled) {
          setReservationsError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
          setReservations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [viewMode, dateKey, refreshTrigger]);

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

  const fetchKey = viewMode === 'day' ? toLocalDateKey(weekStart) : dateKey;
  const effectiveReservations =
    fetchedFor?.viewMode === viewMode && fetchedFor?.dateKey === fetchKey ? reservations : [];
  const filteredReservations = selectedRooms.size === 0
    ? effectiveReservations
    : effectiveReservations.filter((r) => selectedRooms.has(r.room_id));

  return (
    <div className="flex flex-col min-h-screen max-w-screen-2xl mx-auto w-full border-x border-gray-200">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="px-3 sm:px-6 py-3 flex flex-wrap items-center gap-2">
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

      {/* Notice banner */}
      <div className="bg-blue-50 border-b border-blue-100 px-3 sm:px-6 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-blue-800">
          <span className="hidden sm:inline">본 시스템은 소모임(사랑방, 사역팀 등) 전용 입니다. 결혼식 등 큰 행사는</span>
          <span className="sm:hidden">소모임(사랑방, 사역팀 등) 전용 시스템 입니다. 결혼식 등 큰 행사는</span>
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
        <div className="flex flex-col" style={{ gap: '8px' }}>
          {/* Row 1: view mode toggle + navigation (right) */}
          <div className="flex items-center">
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
              <button
                onClick={() => setViewMode('day')}
                aria-label="일간 보기"
                aria-pressed={viewMode === 'day'}
                className={`px-2.5 py-1 font-medium transition ${
                  viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                일간
              </button>
              <button
                onClick={() => setViewMode('week')}
                aria-label="주간 보기"
                aria-pressed={viewMode === 'week'}
                className={`px-2.5 py-1 font-medium transition border-l border-gray-200 ${
                  viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                주간
              </button>
              <button
                onClick={() => setViewMode('month')}
                aria-label="월간 보기"
                aria-pressed={viewMode === 'month'}
                className={`px-2.5 py-1 font-medium transition border-l border-gray-200 ${
                  viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                월간
              </button>
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => navigate(-1)}
                className="p-1 rounded hover:bg-gray-100 text-gray-600 transition"
                aria-label="이전"
              >
                <span className="text-lg font-semibold text-gray-800">‹</span>
              </button>
              <button
                onClick={goToday}
                aria-label="오늘로 이동"
                className="px-2.5 py-0.5 text-sm border border-gray-200 rounded hover:bg-gray-50 text-gray-700 transition"
              >
                오늘
              </button>
              <button
                onClick={() => navigate(1)}
                className="p-1 rounded hover:bg-gray-100 text-gray-600 transition"
                aria-label="다음"
              >
                <span className="text-lg font-semibold text-gray-800">›</span>
              </button>
            </div>
          </div>

          {/* Row 2: title (week/month only) */}
          {viewMode !== 'day' && (
            <div className="text-center">
              <span className="text-lg font-semibold text-gray-700">{title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Room legend / filter */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6">
        {/* Toggle header */}
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            aria-label={legendOpen ? '장소 필터 접기' : '장소 필터 열기'}
            aria-expanded={legendOpen}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition whitespace-nowrap flex-shrink-0 ${
              legendOpen
                ? 'bg-gray-100 border-gray-300 text-gray-800'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            <span className={selectedRooms.size > 0 ? 'hidden sm:inline' : ''}>장소 필터</span>
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
              className="text-xs text-gray-400 hover:text-gray-600 underline transition whitespace-nowrap flex-shrink-0"
            >
              전체 보기
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <span
              className={`text-xs whitespace-nowrap ${loading ? 'text-gray-400 animate-pulse' : 'text-transparent select-none'}`}
              aria-live="polite"
            >
              불러오는 중...
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="w-6 h-2.5 rounded-sm bg-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 whitespace-nowrap">확정</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span
                className="w-6 h-2.5 rounded-sm reservation-pending flex-shrink-0"
                style={{ backgroundColor: '#94a3b8' }}
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">승인대기</span>
            </div>
          </div>
        </div>

        {/* Collapsible room list */}
        {legendOpen && (
          <div className="pb-2 flex flex-wrap gap-x-2 gap-y-1.5">
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
      </header>

      {/* Error banners */}
      {roomsError && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-amber-800">{roomsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-amber-700 hover:text-amber-900 font-medium underline"
            >
              새로고침
            </button>
          </div>
        </div>
      )}
      {reservationsError && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-amber-800">{reservationsError}</p>
            <button
              onClick={refreshReservations}
              className="px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* Calendar */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full">
          <div
            ref={calendarRef}
            className="bg-white border-t border-gray-200 overflow-hidden"
            style={{ height: 'calc(100vh - 170px)' }}
          >
            {viewMode === 'day' ? (
              <DayView key="day" currentDate={currentDate} reservations={filteredReservations} loading={loading} onDayClick={setCurrentDate} onRefresh={refreshReservations} />
            ) : viewMode === 'week' ? (
              <WeekView key="week" weekStart={weekStart} reservations={filteredReservations} onRefresh={refreshReservations} />
            ) : (
              <div key="month" className="h-full overflow-y-auto calendar-scroll">
                <MonthView currentDate={currentDate} reservations={filteredReservations} onRefresh={refreshReservations} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}