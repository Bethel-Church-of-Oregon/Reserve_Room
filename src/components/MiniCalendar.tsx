'use client';

import React, { useState, useEffect } from 'react';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  currentDate: Date;
  onSelectDate: (date: Date) => void;
}

export default function MiniCalendar({ currentDate, onSelectDate }: Props) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  );

  // Sync mini calendar month when main calendar date changes
  useEffect(() => {
    setViewMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate.getFullYear(), currentDate.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;

  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="select-none px-1">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 ml-1">
          {year}년 {month + 1}월
        </span>
        <div className="flex">
          <button
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="이전 달"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="다음 달"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_KO.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium w-7 mx-auto ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const dow = date.getDay();

          return (
            <button
              key={i}
              onClick={() => onSelectDate(date)}
              className={[
                'w-7 h-7 mx-auto flex items-center justify-center text-xs rounded-full transition',
                isToday && isSelected ? 'bg-blue-600 text-white font-bold' : '',
                isToday && !isSelected ? 'bg-blue-600 text-white font-bold' : '',
                isSelected && !isToday ? 'bg-blue-100 text-blue-700 font-bold' : '',
                !isToday && !isSelected && dow === 0 ? 'text-red-500 hover:bg-gray-100' : '',
                !isToday && !isSelected && dow === 6 ? 'text-blue-500 hover:bg-gray-100' : '',
                !isToday && !isSelected && dow !== 0 && dow !== 6 ? 'text-gray-700 hover:bg-gray-100' : '',
              ].join(' ')}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
