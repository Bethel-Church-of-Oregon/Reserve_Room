'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Room } from '@/lib/db';

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
  conflict?: string;
  general?: string;
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
  return new Date().toISOString().slice(0, 10);
}

function ReserveForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rooms, setRooms] = useState<Room[]>([]);
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
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then(setRooms)
      .catch(console.error);
  }, []);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = '제목을 입력해주세요.';
    if (!form.room_id) errs.room_id = '장소를 선택해주세요.';
    if (!form.date) errs.date = '날짜를 선택해주세요.';
    if (!form.start_time) errs.start_time = '시작 시간을 선택해주세요.';
    if (!form.end_time) errs.end_time = '종료 시간을 선택해주세요.';
    if (form.start_time && form.end_time && form.start_time >= form.end_time) {
      errs.end_time = '종료 시간은 시작 시간보다 늦어야 합니다.';
    }
    if (!form.person_in_charge.trim()) errs.person_in_charge = '담당자를 입력해주세요.';
    if (!form.email.trim()) {
      errs.email = '이메일을 입력해주세요.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = '올바른 이메일 형식이 아닙니다.';
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

      const res = await fetch('/api/reservations', {
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
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setErrors({ conflict: '선택하신 시간에 이미 해당 장소 예약이 있습니다. 다른 시간 또는 장소를 선택해주세요.' });
        return;
      }

      if (!res.ok) {
        setErrors({ general: data.error ?? '오류가 발생했습니다.' });
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setErrors({ general: '네트워크 오류가 발생했습니다.' });
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
      return next;
    });
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">신청 완료!</h2>
          <p className="text-gray-600 mb-2">예약 신청이 완료되었습니다.</p>
          <p className="text-gray-500 text-sm mb-6">
            관리자 승인 후 예약이 확정 처리됩니다.
            <br />
            캘린더에서 승인 대기 상태로 표시됩니다.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setSuccess(false);
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
              }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              추가 예약 신청
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              캘린더로 돌아가기
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
            aria-label="뒤로가기"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">장소 예약 신청</h1>
            <p className="text-sm text-gray-500">벧엘교회 회의실 및 장소 예약</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-5">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="예: 청년부 모임, 전도위원회 회의"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              장소 <span className="text-red-500">*</span>
            </label>
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg ${errors.room_id ? 'bg-red-50 border border-red-300' : ''}`}>
              {rooms.map((room) => (
                <label
                  key={room.id}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                    form.room_id === String(room.id)
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="room_id"
                    value={room.id}
                    checked={form.room_id === String(room.id)}
                    onChange={() => handleChange('room_id', String(room.id))}
                    className="sr-only"
                  />
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: room.color }}
                  />
                  <span className="text-sm text-gray-700 truncate">{room.name}</span>
                </label>
              ))}
            </div>
            {errors.room_id && <p className="mt-1 text-xs text-red-500">{errors.room_id}</p>}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              날짜 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.date}
              min={todayStr()}
              onChange={(e) => handleChange('date', e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.date ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
          </div>

          {/* Time range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              예약 시간 <span className="text-red-500">*</span>{' '}
              <span className="text-xs font-normal text-gray-400">(15분 단위)</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <select
                  value={form.start_time}
                  onChange={(e) => handleChange('start_time', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                  value={form.end_time}
                  onChange={(e) => handleChange('end_time', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

          {/* Person in charge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              담당자 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.person_in_charge}
              onChange={(e) => handleChange('person_in_charge', e.target.value)}
              placeholder="이름 또는 연락처"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.person_in_charge ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.person_in_charge && <p className="mt-1 text-xs text-red-500">{errors.person_in_charge}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="example@email.com"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              기타 노트 <span className="text-xs font-normal text-gray-400">(선택)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="특이사항이나 요청사항을 입력해주세요."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error messages above buttons */}
          {errors.conflict && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-700">예약 시간 충돌</p>
                <p className="text-sm text-red-600 mt-0.5">{errors.conflict}</p>
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
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition text-sm"
            >
              {submitting ? '처리 중...' : '예약 신청'}
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
        <div className="text-gray-400 text-sm animate-pulse">불러오는 중...</div>
      </div>
    }>
      <ReserveForm />
    </Suspense>
  );
}
