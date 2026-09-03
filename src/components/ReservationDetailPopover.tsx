'use client';

import React, { useState, useEffect } from 'react';
import { PublicReservation } from '@/lib/db';
import { LIMITS } from '@/lib/constants';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatModalDayTitle } from '@/lib/i18n';
import { pacificDateKey } from '@/lib/date';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  reservation: PublicReservation;
  /** Screen coordinates from getBoundingClientRect() */
  position: { top: number; left: number };
  /** Keep popover visible while hovering over it */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Called when user clicks 취소 신청; parent should show modal and handle submit */
  onRequestCancel?: (reservation: PublicReservation) => void;
  /** Called when user clicks 변경하기; parent should show modal and handle submit */
  onRequestEdit?: (reservation: PublicReservation) => void;
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

/** '2024-03-10T09:00:00' -> '09:00' */
function toTimeValue(dateStr: string): string {
  return dateStr.slice(11, 16);
}

/**
 * Edit an existing reservation. Room and date are intentionally read-only — only
 * the time-of-day, title, contact and notes can move, which keeps the change on
 * the same room and day and lets the server validate with a single conflict check.
 */
export function EditRequestModal({
  reservation,
  onConfirm,
  onCancel,
  admin = false,
}: {
  reservation: PublicReservation;
  onConfirm: () => void;
  onCancel: () => void;
  /** Admin edits go through the admin PATCH route and skip the email check. */
  admin?: boolean;
}) {
  const { t, tRoom, lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState(reservation.title);
  const [person, setPerson] = useState(reservation.person_in_charge);
  const [notes, setNotes] = useState(reservation.notes ?? '');
  const [startTime, setStartTime] = useState(toTimeValue(reservation.start_time));
  const [endTime, setEndTime] = useState(toTimeValue(reservation.end_time));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const dateKey = reservation.start_time.slice(0, 10);

  // Re-seed the form whenever the modal is opened for a different reservation
  useEffect(() => {
    setEmail('');
    setTitle(reservation.title);
    setPerson(reservation.person_in_charge);
    setNotes(reservation.notes ?? '');
    setStartTime(toTimeValue(reservation.start_time));
    setEndTime(toTimeValue(reservation.end_time));
    setError('');
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.id]);

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{t.editSuccess}</h3>
          <p className="text-sm text-gray-500 mb-6">{t.editSuccessDesc}</p>
          <button
            type="button"
            onClick={onConfirm}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnConfirm}
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!admin && !email.trim()) { setError(t.errEmailRequiredEdit); return; }
    if (!title.trim()) { setError(t.errTitleRequired); return; }
    if (title.trim().length > LIMITS.title) { setError(t.errTitleLength(LIMITS.title)); return; }
    if (!person.trim()) { setError(t.errPersonRequired); return; }
    if (person.trim().length > LIMITS.person_in_charge) { setError(t.errPersonLength(LIMITS.person_in_charge)); return; }
    if (notes.trim().length > LIMITS.notes) { setError(t.errNotesLength(LIMITS.notes)); return; }
    if (endTime <= startTime) { setError(t.errEndBeforeStart); return; }

    const nextStart = `${dateKey}T${startTime}:00`;
    const nextEnd = `${dateKey}T${endTime}:00`;
    if (
      title.trim() === reservation.title &&
      person.trim() === reservation.person_in_charge &&
      notes.trim() === (reservation.notes ?? '') &&
      nextStart === reservation.start_time &&
      nextEnd === reservation.end_time
    ) {
      setError(t.errNoChanges);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        person_in_charge: person.trim(),
        notes: notes.trim(),
        start_time: nextStart,
        end_time: nextEnd,
      };
      const res = admin
        ? await fetch(`/api/reservations/${reservation.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'edit', ...payload }),
          })
        : await fetch(`/api/reservations/${reservation.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), ...payload }),
          });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(data.error ?? t.errGeneral);
      }
    } catch {
      setError(t.errNetwork);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.editModalTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{t.editDesc(reservation.title)}</p>

        {/* Fixed: room + date */}
        <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <span
              className="shrink-0 w-2.5 h-2.5 rounded-sm border border-gray-200"
              style={{ backgroundColor: reservation.room_color }}
              aria-hidden
            />
            <span className="truncate">{tRoom(reservation.room_name)}</span>
          </div>
          <div className="mt-0.5 text-sm text-gray-700">
            {formatModalDayTitle(lang, new Date(`${dateKey}T00:00:00`))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">{admin ? t.editFixedNoteAdmin : t.editFixedNote}</p>
        </div>

        {!admin && (
          <div className="mb-4">
            <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 mb-1">{t.editEmailLabel} <span className="text-red-500">*</span></label>
            <input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder={t.editEmailPlaceholder}
              autoFocus
              disabled={loading}
              className={inputClass}
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.fieldTime} <span className="text-red-500">*</span>{' '}
            <span className="text-xs font-normal text-gray-400">{t.fieldTimeUnit}</span>
          </label>
          <div className="flex items-center gap-3">
            <select
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); setError(''); }}
              disabled={loading}
              className={inputClass}
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <span className="text-gray-400 font-medium flex-shrink-0">~</span>
            <select
              value={endTime}
              onChange={(e) => { setEndTime(e.target.value); setError(''); }}
              disabled={loading}
              className={inputClass}
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">{t.fieldTitle} <span className="text-red-500">*</span></label>
          <input
            id="edit-title"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setError(''); }}
            maxLength={LIMITS.title}
            disabled={loading}
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="edit-person" className="block text-sm font-medium text-gray-700 mb-1">{t.fieldPerson} <span className="text-red-500">*</span></label>
          <input
            id="edit-person"
            type="text"
            value={person}
            onChange={(e) => { setPerson(e.target.value); setError(''); }}
            maxLength={LIMITS.person_in_charge}
            disabled={loading}
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="edit-notes" className="block text-sm font-medium text-gray-700 mb-1">
            {t.fieldNotes} <span className="text-xs font-normal text-gray-400">{t.fieldNotesOptional}</span>
          </label>
          <textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setError(''); }}
            maxLength={LIMITS.notes}
            rows={3}
            disabled={loading}
            className={`${inputClass} resize-none`}
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition disabled:opacity-60"
          >
            {t.btnClose}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            {loading ? t.btnEditSubmitting : t.btnEditSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CancelRequestModal({
  reservation,
  onConfirm,
  onCancel,
}: {
  reservation: PublicReservation;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Clear the form whenever the modal is opened for a different reservation
  useEffect(() => {
    setEmail('');
    setReason('');
    setError('');
    setSubmitted(false);
  }, [reservation.id]);

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{t.cancelSuccess}</h3>
          <p className="text-sm text-gray-500 mb-6">{t.cancelSuccessDesc}</p>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnConfirm}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.cancelModalTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{t.cancelDesc(reservation.title)}</p>

        <div className="mb-4">
          <label htmlFor="cancel-email" className="block text-sm font-medium text-gray-700 mb-1">{t.cancelEmailLabel} <span className="text-red-500">*</span></label>
          <input
            id="cancel-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder={t.cancelEmailPlaceholder}
            autoFocus
            disabled={loading}
            className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60 ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">{t.cancelReasonLabel} <span className="text-red-500">*</span></label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder={t.cancelReasonPlaceholder}
            maxLength={LIMITS.reason}
            rows={3}
            disabled={loading}
            className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 resize-none disabled:opacity-60 ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition disabled:opacity-60"
          >
            {t.btnClose}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) { setError(t.errEmailRequiredCancel); return; }
              if (!reason.trim()) { setError(t.errReasonRequired); return; }
              if (reason.trim().length > LIMITS.reason) { setError(t.errReasonLength(LIMITS.reason)); return; }
              setLoading(true);
              setError('');
              try {
                const res = await fetch(`/api/reservations/${reservation.id}/cancel`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: email.trim(), reason: reason.trim() }),
                });
                const data = await res.json();
                if (res.ok) {
                  setSubmitted(true);
                } else {
                  setError(data.error ?? t.errGeneral);
                }
              } catch {
                setError(t.errNetwork);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            {loading ? t.btnCancelSubmitting : t.btnCancelSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReservationDetailPopover({
  reservation,
  position,
  onMouseEnter,
  onMouseLeave,
  onRequestCancel,
  onRequestEdit,
}: Props) {
  const { t, tRoom } = useLanguage();
  const today = pacificDateKey();
  // Recurring bookings are not cancellable here — only an administrator can
  // create one, so only an administrator can clear one. Enforced server-side too.
  const canRequestCancel =
    !reservation.series_id && reservation.status === 'approved' && reservation.end_time.slice(0, 10) >= today;
  const canEdit = reservation.status === 'approved' && reservation.start_time.slice(0, 10) >= today;

  return (
    <div
      role="group"
      aria-label={reservation.title}
      className="fixed z-[100] w-64 rounded-lg border border-gray-200 bg-white py-2.5 px-3 shadow-lg"
      style={{
        left: typeof window !== 'undefined' ? Math.min(position.left, window.innerWidth - 272) : position.left,
        top: position.top,
        transform: 'translateY(-100%) translateY(-6px)',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Title */}
      <div className="font-semibold text-gray-900 text-sm mb-1.5 truncate pr-2" title={reservation.title}>
        {reservation.title}
      </div>

      {/* Room with color swatch */}
      <div className="flex items-center gap-1.5 text-gray-600 text-xs mb-1.5">
        <span
          className="shrink-0 w-2.5 h-2.5 rounded-sm border border-gray-200"
          style={{ backgroundColor: reservation.room_color }}
          aria-hidden
        />
        <span>{tRoom(reservation.room_name)}</span>
      </div>

      {/* Time */}
      <div className="text-gray-600 text-xs mb-1.5">
        {formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}
      </div>

      {/* Person in charge */}
      <div className="text-gray-600 text-xs">
        <span className="text-gray-500">{t.personLabel}</span> {reservation.person_in_charge}
      </div>

      {/* Notes */}
      {reservation.notes && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100">
          <p className="text-gray-500 text-xs line-clamp-2">{reservation.notes}</p>
        </div>
      )}

      {/* Edit / cancel buttons */}
      {/* A recurring booking shows why its cancel button is absent, rather than
          just not having one. */}
      {Boolean(reservation.series_id) && reservation.end_time.slice(0, 10) >= today && (
        <div className="mt-2 text-right text-[10px] text-gray-400">{t.seriesCancelNotice}</div>
      )}
      {((canEdit && onRequestEdit) || (canRequestCancel && onRequestCancel)) && (
        <div className="mt-2 flex justify-end gap-1">
          {canEdit && onRequestEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestEdit(reservation);
              }}
              className="text-[10px] font-medium px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded transition"
            >
              {t.btnRequestEdit}
            </button>
          )}
          {canRequestCancel && onRequestCancel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestCancel(reservation);
              }}
              className="text-[10px] font-medium px-1.5 py-0.5 text-red-600 hover:bg-red-50 rounded transition"
            >
              {t.btnRequestCancel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
