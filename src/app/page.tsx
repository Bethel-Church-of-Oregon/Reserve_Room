'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import WeekView from '@/components/WeekView';
import MonthView from '@/components/MonthView';
import DayView from '@/components/DayView';
import ListView from '@/components/ListView';
import { PublicReservation, Room } from '@/lib/db';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMonthTitle, formatDayTitle, formatWeekTitle } from '@/lib/i18n';
import { pacificTodayDate, toDateKey } from '@/lib/date';

type ViewMode = 'day' | 'week' | 'month' | 'list';

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


function RulesModal({ onAgree, onClose }: { onAgree: () => void; onClose: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{t.rulesTitle}</h2>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm text-gray-700 space-y-4">
          <p>{t.rulesIntro}</p>
          {t.rulesItems.map((item, i) => (
            <div key={i}>
              <p className="font-semibold text-gray-900">{item.title}</p>
              <p className="mt-1">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-800">{t.rulesAgree}</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
            >
              {t.btnClose}
            </button>
            <button
              onClick={onAgree}
              disabled={!agreed}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
            >
              {t.btnReserveFromRules}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { lang, setLang, t, tRoom } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showRulesModal, setShowRulesModal] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Sync to church-local (Pacific) time after SSR hydration
  useEffect(() => {
    setCurrentDate(pacificTodayDate());
  }, []);

  // Swipe gesture animation state
  const [swipeX, setSwipeX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [reservations, setReservations] = useState<PublicReservation[]>([]);
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
      setIsDragging(true);
      setSwipeX(0);
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
        setSwipeX(dx);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      touchStartY.current = null;
      const locked = swipeLocked.current;
      swipeLocked.current = null;
      if (locked !== 'horizontal') {
        setIsDragging(false);
        setSwipeX(0);
        return;
      }
      setIsDragging(false);
      if (Math.abs(dx) < 60) {
        setSwipeX(0);
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      setSwipeX(dx < 0 ? -window.innerWidth : window.innerWidth);
      setTimeout(() => {
        navigateRef.current(dir);
        setIsDragging(true);
        setSwipeX(dir < 0 ? -window.innerWidth : window.innerWidth);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setIsDragging(false);
          setSwipeX(0);
        }));
      }, 220);
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
  const dateKey = toDateKey(currentDate);
  // Day view fetches the whole week, so only refetch when the week (or view/refresh) changes
  const fetchPeriodKey = viewMode === 'day' ? toDateKey(weekStart) : viewMode === 'list' ? 'list' : dateKey;

  useEffect(() => {
    setRoomsError(null);
    fetch('/api/rooms')
      .then((r) => {
        if (!r.ok) throw new Error(t.errRooms);
        return r.json();
      })
      .then(setRooms)
      .catch((e) => {
        console.error('rooms fetch error:', e);
        setRoomsError(e instanceof Error ? e.message : t.errRooms);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ws = startOfWeek(currentDate);
    let from: string, to: string;

    if (viewMode === 'day') {
      from = toDateKey(ws);
      const weekEnd = new Date(ws);
      weekEnd.setDate(ws.getDate() + 7);
      to = toDateKey(weekEnd);
    } else if (viewMode === 'week') {
      from = toDateKey(ws);
      const weekEnd = new Date(ws);
      weekEnd.setDate(ws.getDate() + 7);
      to = toDateKey(weekEnd);
    } else if (viewMode === 'list') {
      const todayPacific = pacificTodayDate();
      from = toDateKey(todayPacific);
      const farFuture = new Date(todayPacific);
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      to = toDateKey(farFuture);
    } else {
      from = toDateKey(startOfMonth(currentDate));
      const firstOfNext = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      to = toDateKey(firstOfNext);
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
            setReservationsError(typeof data?.error === 'string' ? data.error : t.errReservations);
            setReservations([]);
          } else {
            setReservations(Array.isArray(data) ? data : []);
            setFetchedFor({ viewMode, dateKey: viewMode === 'day' ? from : viewMode === 'list' ? 'list' : dateKey });
          }
        }
      } catch (e) {
        console.error('fetch reservations error:', e);
        if (!cancelled) {
          setReservationsError(t.errNetwork);
          setReservations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [viewMode, fetchPeriodKey, refreshTrigger]);

  function navigate(dir: -1 | 1) {
    if (viewMode === 'list') return;
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'day') {
        d.setDate(d.getDate() + dir);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() + dir * 7);
      } else {
        const result = new Date(d.getFullYear(), d.getMonth() + dir, 1);
        return result;
      }
      return d;
    });
  }

  function goToday() {
    setCurrentDate(pacificTodayDate());
  }

  const title = viewMode === 'day'
    ? formatDayTitle(lang, currentDate)
    : viewMode === 'week'
    ? formatWeekTitle(lang, weekStart)
    : formatMonthTitle(lang, currentDate);

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

  const fetchKey = viewMode === 'day' ? toDateKey(weekStart) : viewMode === 'list' ? 'list' : dateKey;
  const isFetchPending = !fetchedFor || fetchedFor.viewMode !== viewMode || fetchedFor.dateKey !== fetchKey;
  const effectiveReservations = isFetchPending ? [] : reservations;
  const filteredReservations = selectedRooms.size === 0
    ? effectiveReservations
    : effectiveReservations.filter((r) => selectedRooms.has(r.room_id));

  return (
    <div className="flex flex-col h-screen max-w-screen-xl mx-auto w-full border-x border-gray-200 overflow-hidden">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        {/* Single row at every width: never wraps, and the title absorbs whatever
            space the buttons leave (truncating only if it genuinely runs out). */}
        <div className="px-3 sm:px-6 py-3 flex flex-nowrap items-center gap-1.5 sm:gap-2">
          {/* Logo / Title */}
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={() => { setCurrentDate(pacificTodayDate()); setViewMode('month'); }}
              className="min-w-0 max-w-full truncate text-[18px] sm:text-xl font-bold text-blue-700 hover:text-blue-800 transition-colors"
            >
              <span className="hidden sm:inline">{t.siteTitle}</span>
              <span className="sm:hidden">{t.siteTitleShort}</span>
            </button>
          </div>

          {/* Right buttons */}
          <button
            onClick={() => setShowRulesModal(true)}
            className="flex-shrink-0 px-2.5 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] sm:text-sm font-medium rounded-lg transition whitespace-nowrap"
          >
            <span className="hidden sm:inline">{t.btnReserve}</span>
            <span className="sm:hidden">{t.btnReserveShort}</span>
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="flex-shrink-0 px-2.5 py-1.5 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-800 text-white text-[13px] sm:text-sm font-medium rounded-lg transition whitespace-nowrap"
          >
            <span className="hidden sm:inline">{t.btnAdmin}</span>
            <span className="sm:hidden">{t.btnAdminShort}</span>
          </button>
          {/* Language toggle — shows the language it switches to */}
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            className="flex-shrink-0 px-2 py-1.5 sm:px-2.5 text-[11px] sm:text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
            aria-label="Switch language"
          >
            {lang === 'ko' ? 'EN' : (
              <>
                <span className="hidden sm:inline">한국어</span>
                <span className="sm:hidden">KO</span>
              </>
            )}
          </button>
        </div>

      {/* Notice banner */}
      <div className="bg-blue-50 border-b border-blue-100 px-3 sm:px-6 py-2">
        {/* Plain inline flow, not flex: as a flex item the button was laid out on its
            own flex line, which cut the sentence short and left a word or two
            stranded. Inline, the text packs each line full and the button sits
            directly after the last word whenever it fits. */}
        <div className="text-xs sm:text-sm text-blue-800 leading-relaxed">
          <span className="hidden sm:inline">{t.noticeDesktop}</span>
          <span className="sm:hidden">{t.noticeMobile}</span>{' '}
          <a
            href="https://drive.google.com/drive/folders/1lz7kaoe8GQf2FZI1Dfb-3hDEEWpFgygj"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center align-middle px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition whitespace-nowrap"
          >
            {t.noticeLink}
          </a>
          <span>{t.noticeSuffix}</span>
        </div>
      </div>

      {/* Calendar controls */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
        <div className="flex flex-col" style={{ gap: '8px' }}>
          {/* Row 1: view mode toggle + navigation (right) */}
          <div className="flex items-center">
            {/* Mobile: 월간 | 일간 | 목록 */}
            <div className="lg:hidden flex rounded-md border border-gray-200 overflow-hidden text-sm">
              {(['day', 'month', 'list'] as const).map((mode, i) => (
                <button
                  key={mode}
                  onClick={() => { if (mode === 'day') setCurrentDate(pacificTodayDate()); setViewMode(mode); }}
                  aria-pressed={viewMode === mode}
                  className={`px-2.5 py-1 font-medium transition ${i > 0 ? 'border-l border-gray-200' : ''} ${
                    viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode === 'month' ? t.viewMonth : mode === 'day' ? t.viewDay : t.viewList}
                </button>
              ))}
            </div>
            {/* Desktop: 일간 | 주간 | 월간 | 목록 */}
            <div className="hidden lg:flex rounded-md border border-gray-200 overflow-hidden text-sm">
              {(['day', 'week', 'month', 'list'] as const).map((mode, i) => (
                <button
                  key={mode}
                  onClick={() => { if (mode === 'day' || mode === 'week') setCurrentDate(pacificTodayDate()); setViewMode(mode); }}
                  aria-pressed={viewMode === mode}
                  className={`px-2.5 py-1 font-medium transition ${i > 0 ? 'border-l border-gray-200' : ''} ${
                    viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode === 'day' ? t.viewDay : mode === 'week' ? t.viewWeek : mode === 'month' ? t.viewMonth : t.viewList}
                </button>
              ))}
            </div>
            {viewMode === 'day' && (
              <button
                onClick={goToday}
                aria-label={t.today}
                className="ml-auto px-2.5 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 text-gray-700 transition"
              >
                {t.today}
              </button>
            )}
          </div>

          {/* Row 2: title (day/week/month) */}
          {viewMode === 'month' && (
            <p className="text-left text-[11px] text-gray-500 px-1 -mb-[10px]">{t.monthHint}</p>
          )}
          {viewMode !== 'list' && (
            <div className="flex items-center justify-center gap-2 -mb-1">
              <button
                onClick={() => navigate(-1)}
                className="p-1 rounded hover:bg-gray-100 transition"
                aria-label={t.prev}
              >
                <span className="text-4xl font-semibold text-gray-700 leading-none">‹</span>
              </button>
              <span className="text-lg font-semibold text-gray-700">{title}</span>
              <button
                onClick={() => navigate(1)}
                className="p-1 rounded hover:bg-gray-100 transition"
                aria-label={t.next}
              >
                <span className="text-4xl font-semibold text-gray-700 leading-none">›</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Room legend / filter */}
      <div className="relative bg-white border-b border-gray-100 px-3 sm:px-6">
        {/* Toggle header */}
        <div className="relative z-50 flex items-center gap-2 py-2">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            aria-label={legendOpen ? t.filterCollapseLabel : t.filterExpandLabel}
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
            <span className={selectedRooms.size > 0 ? 'hidden sm:inline' : ''}>{t.roomFilter}</span>
            {selectedRooms.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs leading-none">
                {selectedRooms.size}
              </span>
            )}
            <span className="text-gray-400">{legendOpen ? t.filterCollapse : t.filterExpand}</span>
          </button>
          {selectedRooms.size > 0 && !legendOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); clearFilter(); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition whitespace-nowrap flex-shrink-0"
            >
              {t.showAll}
            </button>
          )}
          {selectedRooms.size > 0 && legendOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); clearFilter(); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition whitespace-nowrap flex-shrink-0"
            >
              {t.deselect}
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {loading && (
              <span className="text-[10px] text-gray-400 animate-pulse whitespace-nowrap" aria-live="polite">
                {t.loading}
              </span>
            )}
          </div>
        </div>

        {/* Selected chips shown when collapsed */}
        {!legendOpen && selectedRooms.size > 0 && (
          <div className="pb-2 flex flex-wrap gap-x-2 gap-y-1.5">
            {rooms.filter((room) => selectedRooms.has(room.id)).map((room) => (
              <button
                key={room.id}
                onClick={(e) => { e.stopPropagation(); toggleRoom(room.id); }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition border-transparent text-white font-medium"
                style={{ backgroundColor: room.color, borderColor: room.color }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
                />
                {tRoom(room.name)}
              </button>
            ))}
          </div>
        )}

        {/* Collapsible room list — overlay on mobile, inline on desktop */}
        {legendOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 z-40 sm:hidden"
              onClick={() => setLegendOpen(false)}
            />
            {/* Panel */}
            <div className="
              sm:relative sm:z-auto sm:shadow-none sm:border-0 sm:bg-transparent sm:px-0 sm:pb-2 sm:pt-0
              absolute left-0 right-0 z-50 bg-white shadow-lg border-t border-gray-200 px-3 pb-3 pt-2
            ">
              <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                {rooms.map((room) => {
                  const selected = selectedRooms.has(room.id);
                  return (
                    <button
                      key={room.id}
                      onClick={(e) => { e.stopPropagation(); toggleRoom(room.id); }}
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
                      {tRoom(room.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
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
              {t.btnRefresh}
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
              {t.btnRetry}
            </button>
          </div>
        </div>
      )}

      {/* Calendar */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full">
          <div
            ref={calendarRef}
            className="bg-white border-t border-gray-200 h-full overflow-hidden"
          >
            {viewMode === 'day' ? (
              <DayView key="day" currentDate={currentDate} reservations={filteredReservations} onDayClick={setCurrentDate} onRefresh={refreshReservations} swipeOffset={swipeX} swipeDragging={isDragging} />
            ) : viewMode === 'week' ? (
              <WeekView key="week" weekStart={weekStart} reservations={filteredReservations} onRefresh={refreshReservations} swipeOffset={swipeX} swipeDragging={isDragging} />
            ) : viewMode === 'list' ? (
              <ListView key="list" reservations={filteredReservations} loading={isFetchPending} onRefresh={refreshReservations} />
            ) : (
              <div key="month" className="h-full overflow-y-auto calendar-scroll">
                <MonthView currentDate={currentDate} reservations={filteredReservations} onRefresh={refreshReservations} swipeOffset={swipeX} swipeDragging={isDragging} />
              </div>
            )}
          </div>
        </div>
      </main>
      {showRulesModal && (
        <RulesModal
          onAgree={() => { setShowRulesModal(false); router.push('/reserve'); }}
          onClose={() => setShowRulesModal(false)}
        />
      )}
    </div>
  );
}
