'use client';

import React, { useState, useEffect } from 'react';
import { ReservationWithRoom } from '@/lib/db';
import { LIMITS } from '@/lib/constants';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  reservation: ReservationWithRoom;
  /** Screen coordinates from getBoundingClientRect() */
  position: { top: number; left: number };
  /** Keep popover visible while hovering over it */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Called when user clicks 취소 신청; parent should show modal and handle submit */
  onRequestCancel?: (reservation: ReservationWithRoom) => void;
}

export function CancelRequestModal({
  reservation,
  onConfirm,
  onCancel,
}: {
  reservation: ReservationWithRoom;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<'one' | 'series'>('one');
  const [submitted, setSubmitted] = useState(false);
  const hasSeries = Boolean(reservation.series_id);

  // Reset to "one instance" whenever the modal is opened with a different reservation
  useEffect(() => {
    setScope('one');
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
          <h3 className="text-lg font-bold text-gray-800 mb-2">취소 완료</h3>
          <p className="text-sm text-gray-500 mb-6">예약이 취소되었습니다.</p>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">예약 취소 신청</h3>
        <p className="text-sm text-gray-500 mb-4">
          <strong className="text-gray-700">{reservation.title}</strong> 예약의 취소를 신청합니다.
        </p>

        {hasSeries && (
          <div className="mb-4">
            <div className="block text-sm font-medium text-gray-700 mb-1">취소 범위</div>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cancel-scope"
                  value="one"
                  checked={scope === 'one'}
                  onChange={() => setScope('one')}
                  disabled={loading}
                />
                <span>이 일정만 취소</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cancel-scope"
                  value="series"
                  checked={scope === 'series'}
                  onChange={() => setScope('series')}
                  disabled={loading}
                />
                <span>이 일정부터 이후 반복 일정 모두 취소</span>
              </label>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">취소 사유 <span className="text-red-500">*</span></label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder="취소 사유를 입력해주세요."
            maxLength={LIMITS.reason}
            rows={3}
            autoFocus
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
            닫기
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!reason.trim()) { setError('취소 사유를 입력해주세요.'); return; }
              if (reason.trim().length > LIMITS.reason) { setError(`취소 사유는 ${LIMITS.reason}자 이하여야 합니다.`); return; }
              setLoading(true);
              setError('');
              try {
                const res = await fetch(`/api/reservations/${reservation.id}/cancel`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reason: reason.trim(), scope }),
                });
                const data = await res.json();
                if (res.ok) {
                  setSubmitted(true);
                } else {
                  setError(data.error ?? '오류가 발생했습니다.');
                }
              } catch {
                setError('네트워크 오류가 발생했습니다.');
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
          >
            {loading ? '제출 중...' : '취소 신청'}
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
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const canRequestCancel = (reservation.status === 'approved' || reservation.status === 'pending') && reservation.end_time.slice(0, 10) >= today;

  return (
    <div
      role="group"
      aria-label={`${reservation.title} 예약 상세`}
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
        <span>{reservation.room_name}</span>
      </div>

      {/* Time */}
      <div className="text-gray-600 text-xs mb-1.5">
        {formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}
      </div>

      {/* Person in charge */}
      <div className="text-gray-600 text-xs">
        <span className="text-gray-500">담당:</span> {reservation.person_in_charge}
      </div>

      {/* Notes */}
      {reservation.notes && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100">
          <p className="text-gray-500 text-xs line-clamp-2">{reservation.notes}</p>
        </div>
      )}

      {/* Cancel button */}
      {canRequestCancel && onRequestCancel && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestCancel(reservation);
            }}
            className="text-[10px] font-medium px-1.5 py-0.5 text-red-600 hover:bg-red-50 rounded transition"
          >
            취소 신청하기
          </button>
        </div>
      )}
    </div>
  );
}
