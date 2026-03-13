'use client';

import React from 'react';
import { ReservationWithRoom } from '@/lib/db';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  weekStart: Date;
  selectedDate: Date;
  reservations: ReservationWithRoom[];
  onSelectDate: (date: Date) => void;
}

export default function WeekStrip({ weekStart, selectedDate, reservations, onSelectDate }: Props) {
  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selectedDate);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Collect which dates have approved or pending reservations
  const daysWithEvents = new Set(reservations.map((r) => r.start_time.slice(0, 10)));

  return (
    <div className="flex bg-white border-b border-gray-200 px-1">
      {days.map((day, i) => {
        const key = dateKey(day);
        const isToday = key === todayKey;
        const isSelected = key === selectedKey;
        const hasEvents = daysWithEvents.has(key);

        return (
          <button
            key={i}
            onClick={() => onSelectDate(day)}
            className="flex-1 flex flex-col items-center py-1.5 gap-0.5 min-w-0"
          >
            {/* Day abbreviation */}
            <span
              className={`text-xs font-medium ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              }`}
            >
              {DAYS_KO[day.getDay()]}
            </span>

            {/* Date number */}
            <span
              className={[
                'w-8 h-8 flex items-center justify-center text-sm font-medium rounded-full transition',
                isSelected && isToday ? 'bg-blue-600 text-white' : '',
                isSelected && !isToday ? 'bg-blue-600 text-white' : '',
                !isSelected && isToday ? 'text-blue-600 font-bold' : '',
                !isSelected && !isToday && i === 0 ? 'text-red-500' : '',
                !isSelected && !isToday && i === 6 ? 'text-blue-500' : '',
                !isSelected && !isToday && i !== 0 && i !== 6 ? 'text-gray-800' : '',
              ].join(' ')}
            >
              {day.getDate()}
            </span>

            {/* Event dot */}
            <div className="h-1.5 flex justify-center">
              {hasEvents && (
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white opacity-80' : isToday ? 'bg-blue-500' : 'bg-gray-400'
                  }`}
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
