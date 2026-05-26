'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, addMonths } from 'date-fns';
import { Room } from '@/lib/db';
import { LIMITS } from '@/lib/constants';
import { useLanguage } from '@/contexts/LanguageContext';

type RecurringType = 'none' | 'daily' | 'weekly' | 'monthly';

interface FormData {
  title: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  person_in_charge: string;
  email: string;
  notes: string;
}

interface FormErrors {
  title?: string;
  room_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  person_in_charge?: string;
  email?: string;
  notes?: string;
  recurring_until?: string;
  conflict?: string;
  conflictDates?: string[];
  general?: string;
}

interface SuccessInfo {
  created: number;
  conflicts: number;
  conflictDates: string[];
  email: string;
}

function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function oneMonthLaterStr(): string {
  return format(addMonths(new Date(), 1), 'yyyy-MM-dd');
}

function ReserveForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, setLang, t, tRoom } = useLanguage();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    title: '',
    room_id: '',
    date: searchParams.get('date') ?? todayStr(),
    start_time: '09:00',
    end_time: '10:00',
    person_in_charge: '',
    email: '',
    notes: '',
  });
  const isAdmin = searchParams.get('admin') === 'true';
  const [recurring, setRecurring] = useState<RecurringType>('none');
  const [recurringUntil, setRecurringUntil] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const recurringLabels: Record<RecurringType, string> = {
    none: t.recurringNone,
    daily: t.recurringDaily,
    weekly: t.recurringWeekly,
    monthly: t.recurringMonthly,
  };

  const loadRooms = useCallback(() => {
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
  useEffect(() => { loadRooms(); }, [loadRooms]);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const title = form.title.trim();
    if (!title) errs.title = t.errTitleRequired;
    else if (title.length > LIMITS.title) errs.title = t.errTitleLength(LIMITS.title);
    if (!form.room_id) errs.room_id = t.errRoomRequired;
    if (!form.date) errs.date = t.errDateRequired;
    if (!form.start_time) errs.start_time = t.errStartRequired;
    if (!form.end_time) errs.end_time = t.errEndRequired;
    if (form.start_time && form.end_time && form.start_time >= form.end_time) {
      errs.end_time = t.errEndBeforeStart;
    }
    const person = form.person_in_charge.trim();
    if (!person) errs.person_in_charge = t.errPersonRequired;
    else if (person.length > LIMITS.person_in_charge) errs.person_in_charge = t.errPersonLength(LIMITS.person_in_charge);
    const email = form.email.trim();
    if (!email) {
      errs.email = t.errEmailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = t.errEmailFormat;
    } else if (email.length > LIMITS.email) errs.email = t.errEmailLength(LIMITS.email);
    if (form.notes.trim().length > LIMITS.notes) errs.notes = t.errNotesLength(LIMITS.notes);
    if (recurring !== 'none') {
      if (!recurringUntil) {
        errs.recurring_until = t.errRecurringUntilRequired;
      } else if (recurringUntil <= form.date) {
        errs.recurring_until = t.errRecurringUntilAfterStart;
      }
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setErrors({});

    try {
      const start_time = `${form.date}T${form.start_time}:00`;
      const end_time = `${form.date}T${form.end_time}:00`;

      const res = await fetch(`/api/reservations${isAdmin ? '?admin=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          room_id: parseInt(form.room_id),
          start_time,
          end_time,
          person_in_charge: form.person_in_charge.trim(),
          email: form.email.trim(),
          notes: form.notes.trim() || undefined,
          recurring: recurring !== 'none' ? recurring : undefined,
          recurring_until: recurring !== 'none' ? recurringUntil : undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        const msg = typeof data?.message === 'string' ? data.message : t.errConflictDefault;
        const dates = Array.isArray(data?.conflictDates) ? data.conflictDates : undefined;
        setErrors({ conflict: msg, conflictDates: dates });
        return;
      }

      if (!res.ok) {
        setErrors({ general: data.error ?? t.errGeneral });
        return;
      }

      setSuccessInfo(
        data.created !== undefined
          ? { ...data, email: form.email.trim() }
          : { created: 1, conflicts: 0, conflictDates: [], email: form.email.trim() }
      );
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setErrors({ general: t.errNetwork });
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field as keyof FormErrors];
      delete next.conflict;
      delete next.conflictDates;
      return next;
    });
  }

  function handleReset() {
    setSuccess(false);
    setSuccessInfo(null);
    setForm({
      title: '',
      room_id: '',
      date: todayStr(),
      start_time: '09:00',
      end_time: '10:00',
      person_in_charge: '',
      email: '',
      notes: '',
    });
    setRecurring('none');
    setRecurringUntil('');
  }

  if (success && successInfo) {
    const isRecurring = successInfo.created > 1 || successInfo.conflicts > 0;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{t.reserveSuccess}</h2>

          {isRecurring ? (
            <div className="space-y-3 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <span className="text-green-700 font-medium text-sm">{t.recurringCreated(successInfo.created)}</span>
              </div>
              {successInfo.conflicts > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-700 font-medium text-sm mb-1">{t.recurringConflicts(successInfo.conflicts)}</p>
                  <ul className="text-xs text-yellow-600 space-y-0.5">
                    {successInfo.conflictDates.map((d) => (
                      <li key={d}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-gray-500 text-sm text-center">
                {t.reserveSuccessEmailLine1}<br /><strong>{successInfo.email}</strong>{t.reserveSuccessEmailLine2}<br />{t.reserveSuccessEmailLine3}
              </p>
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-gray-600">{t.reserveSuccessDesc}</p>
              <p className="text-gray-500 text-sm mt-1">
                {t.reserveSuccessEmailLine1}<br /><strong>{successInfo.email}</strong>{t.reserveSuccessEmailLine2}<br />{t.reserveSuccessEmailLine3}
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition whitespace-nowrap"
            >
              {t.btnMoreReserve}
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition whitespace-nowrap"
            >
              {t.btnBackToCalendar}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-gray-700 p-1 rounded transition text-lg"
            aria-label={t.backLabel}
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{t.reservePageTitle}</h1>
            <p className="text-sm text-gray-500">{t.reservePageSubtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            className="px-2.5 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
            aria-label="Switch language"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-5">

          {/* Title */}
          <div>
            <label htmlFor="reserve-title" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldTitle} <span className="text-red-500">*</span>
            </label>
            <input
              id="reserve-title"
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder={t.placeholderTitle}
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          {/* Room */}
          <div>
            <label htmlFor="reserve-room" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldRoom} <span className="text-red-500">*</span>
            </label>
            {roomsError && (
              <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                <p className="text-sm text-amber-800">{roomsError}</p>
                <button
                  type="button"
                  onClick={loadRooms}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900 underline flex-shrink-0"
                >
                  {t.btnRetry}
                </button>
              </div>
            )}
            <div className="relative">
              <select
                id="reserve-room"
                value={form.room_id}
                onChange={(e) => handleChange('room_id', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${
                  errors.room_id ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              >
                <option value="">{t.placeholderRoom}</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{tRoom(room.name)}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                {form.room_id ? (
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: rooms.find((r) => String(r.id) === form.room_id)?.color }}
                  />
                ) : (
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
            </div>
            {errors.room_id && <p className="mt-1 text-xs text-red-500">{errors.room_id}</p>}
          </div>

          {/* Date */}
          <div>
            <label htmlFor="reserve-date" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldDate} <span className="text-red-500">*</span>
            </label>
            <input
              id="reserve-date"
              type="date"
              value={form.date}
              min={todayStr()}
              max={isAdmin ? undefined : oneMonthLaterStr()}
              onChange={(e) => handleChange('date', e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.date ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
            {!isAdmin && <p className="mt-1 text-xs text-gray-400">{t.dateLimitHint}</p>}
          </div>

          {/* Time range */}
          <div>
            <label htmlFor="reserve-start-time" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldTime} <span className="text-red-500">*</span>{' '}
              <span className="text-xs font-normal text-gray-400">{t.fieldTimeUnit}</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <select
                  id="reserve-start-time"
                  value={form.start_time}
                  onChange={(e) => handleChange('start_time', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.start_time ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.start_time && <p className="mt-1 text-xs text-red-500">{errors.start_time}</p>}
              </div>
              <span className="text-gray-400 font-medium flex-shrink-0">~</span>
              <div className="flex-1">
                <select
                  id="reserve-end-time"
                  value={form.end_time}
                  onChange={(e) => handleChange('end_time', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.end_time ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.end_time && <p className="mt-1 text-xs text-red-500">{errors.end_time}</p>}
              </div>
            </div>
          </div>

          {/* Recurring — admin only */}
          {isAdmin && <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">{t.fieldRecurring}</label>
            <div className="flex flex-wrap gap-2">
              {(['none', 'daily', 'weekly', 'monthly'] as RecurringType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRecurring(option);
                    setErrors((prev) => { const next = { ...prev }; delete next.recurring_until; return next; });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition ${
                    recurring === option
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {recurringLabels[option]}
                </button>
              ))}
            </div>

            {recurring !== 'none' && (
              <div>
                <label htmlFor="reserve-recurring-until" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.fieldRecurringUntil} <span className="text-red-500">*</span>
                </label>
                <input
                  id="reserve-recurring-until"
                  type="date"
                  value={recurringUntil}
                  min={form.date || todayStr()}
                  onChange={(e) => {
                    setRecurringUntil(e.target.value);
                    setErrors((prev) => { const next = { ...prev }; delete next.recurring_until; return next; });
                  }}
                  className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.recurring_until ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.recurring_until && <p className="mt-1 text-xs text-red-500">{errors.recurring_until}</p>}
                <p className="mt-1.5 text-xs text-gray-400">
                  {form.date && recurringUntil && recurringUntil > form.date
                    ? t.recurringHint(form.date, recurringUntil, recurringLabels[recurring])
                    : t.recurringHintDefault(recurringLabels[recurring])}
                </p>
              </div>
            )}
          </div>}

          {/* Person in charge */}
          <div>
            <label htmlFor="reserve-person" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldPerson} <span className="text-red-500">*</span>
            </label>
            <input
              id="reserve-person"
              type="text"
              value={form.person_in_charge}
              onChange={(e) => handleChange('person_in_charge', e.target.value)}
              placeholder={t.placeholderPerson}
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.person_in_charge ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.person_in_charge && <p className="mt-1 text-xs text-red-500">{errors.person_in_charge}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reserve-email" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldEmail} <span className="text-red-500">*</span>
            </label>
            <input
              id="reserve-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="example@email.com"
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="reserve-notes" className="block text-sm font-medium text-gray-700 mb-1">
              {t.fieldNotes} <span className="text-xs font-normal text-gray-400">{t.fieldNotesOptional}</span>
            </label>
            <textarea
              id="reserve-notes"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t.placeholderNotes}
              rows={3}
              maxLength={LIMITS.notes}
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                errors.notes ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.notes && <p className="mt-1 text-xs text-red-500">{errors.notes}</p>}
          </div>

          {/* Error messages above buttons */}
          {errors.conflict && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-700">{t.conflictTitle}</p>
                <p className="text-sm text-red-600 mt-0.5">{errors.conflict}</p>
                {errors.conflictDates && errors.conflictDates.length > 0 && (
                  <ul className="text-xs text-red-600 mt-2 space-y-0.5">
                    {errors.conflictDates.map((d) => (
                      <li key={d}>• {d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {errors.general}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition text-sm"
            >
              {t.btnCancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition text-sm"
            >
              {submitting ? t.btnSubmitting : recurring !== 'none' ? t.btnRecurringReserve : t.btnReserveAction}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading...</div>
      </div>
    }>
      <ReserveForm />
    </Suspense>
  );
}
