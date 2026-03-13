'use client';

import React from 'react';
import { ReservationWithRoom } from '@/lib/db';

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
}

export default function ReservationDetailPopover({
  reservation,
  position,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const isPending = reservation.status === 'pending';

  return (
    <div
      role="tooltip"
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

      {/* Status badge */}
      <div className="mt-2 flex justify-end">
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            isPending
              ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {isPending ? '승인 대기 중' : '확정'}
        </span>
      </div>
    </div>
  );
}
