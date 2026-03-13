'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ReservationWithRoom } from '@/lib/db';

type FilterStatus = 'pending' | 'approved' | 'cancellation_requested' | 'all';

function formatDateTime(dt: string): string {
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '오류가 발생했습니다.');
      } else {
        onSuccess();
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">관리자 로그인</h1>
          <p className="text-sm text-gray-500 mt-1">오레곤벧엘교회 예약관리시스템</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="관리자 비밀번호를 입력하세요"
              autoFocus
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 ${
                error ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white rounded-lg font-medium transition text-sm"
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            돌아가기
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Rejection Modal ───────────────────────────────────────────────────────────
function RejectModal({
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">예약 거절</h3>
        <p className="text-sm text-gray-500 mb-4">
          <strong className="text-gray-700">{reservation.title}</strong> 예약을 거절합니다.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">거절 사유 <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder="거절 사유를 입력해주세요."
            rows={3}
            autoFocus
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            취소
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) { setError('거절 사유를 입력해주세요.'); return; }
              onConfirm(reason.trim());
            }}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            거절 확정
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject Cancellation Modal ─────────────────────────────────────────────────
function RejectCancelModal({
  reservation,
  onConfirm,
  onCancel,
}: {
  reservation: ReservationWithRoom;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">취소 신청 거절</h3>
        <p className="text-sm text-gray-500 mb-4">
          <strong className="text-gray-700">{reservation.title}</strong> 예약의 취소 신청을 거절합니다.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">거절 사유 (선택, 요청자 이메일에 포함)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="선택 사항입니다."
            rows={3}
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(reason.trim() || undefined)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            취소 거절
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteModal({
  reservation,
  onConfirm,
  onCancel,
}: {
  reservation: ReservationWithRoom;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-2">예약 삭제</h3>
        <p className="text-sm text-gray-600 mb-1">다음 예약을 삭제하시겠습니까?</p>
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-gray-800">{reservation.title}</p>
          <p className="text-gray-500">{reservation.room_name}</p>
          <p className="text-gray-500">{formatDateTime(reservation.start_time)} ~ {formatDateTime(reservation.end_time)}</p>
        </div>
        <p className="text-xs text-red-500 mb-4">* 삭제된 예약은 복구할 수 없습니다.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const [reservations, setReservations] = useState<ReservationWithRoom[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<ReservationWithRoom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReservationWithRoom | null>(null);
  const [rejectCancelTarget, setRejectCancelTarget] = useState<ReservationWithRoom | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reservations');
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setReservations(Array.isArray(data) ? data : []);
    } catch {
      showToast('데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  const filtered = reservations.filter((r) => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'approved') return r.status === 'approved';
    if (filter === 'cancellation_requested') return r.status === 'cancellation_requested';
    return true;
  });

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pendingIds = filtered.filter((r) => r.status === 'pending').map((r) => r.id);
    if (pendingIds.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  }

  async function handleApprove(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) { showToast('승인 완료'); fetchReservations(); setSelected((p) => { const n = new Set(p); n.delete(id); return n; }); }
      else { const d = await res.json(); showToast(d.error ?? '오류', 'error'); }
    } catch { showToast('네트워크 오류', 'error'); }
    finally { setActionLoading(null); }
  }

  async function handleApproveSelected() {
    const ids = Array.from(selected).filter((id) => reservations.find((r) => r.id === id)?.status === 'pending');
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${data.approved}건 승인 완료`);
        setSelected(new Set());
        fetchReservations();
      } else {
        showToast(data.error ?? '오류', 'error');
      }
    } catch {
      showToast('네트워크 오류', 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleReject(id: number, reason: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      });
      if (res.ok) { showToast('거절 처리되었습니다.'); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? '오류', 'error'); }
    } catch { showToast('네트워크 오류', 'error'); }
    finally { setActionLoading(null); setRejectTarget(null); }
  }

  async function handleDelete(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('삭제되었습니다.'); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? '오류', 'error'); }
    } catch { showToast('네트워크 오류', 'error'); }
    finally { setActionLoading(null); setDeleteTarget(null); }
  }

  const pendingCount = reservations.filter((r) => r.status === 'pending').length;
  const cancellationRequestedCount = reservations.filter((r) => r.status === 'cancellation_requested').length;
  const selectedPendingCount = Array.from(selected).filter((id) => reservations.find((r) => r.id === id)?.status === 'pending').length;

  async function handleApproveCancellation(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_cancellation' }),
      });
      if (res.ok) { showToast('취소 승인되었습니다.'); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? '오류', 'error'); }
    } catch { showToast('네트워크 오류', 'error'); }
    finally { setActionLoading(null); }
  }

  async function handleRejectCancellation(id: number, reason?: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_cancellation', reason: reason ?? '' }),
      });
      if (res.ok) { showToast('취소 거절되었습니다.'); fetchReservations(); setRejectCancelTarget(null); }
      else { const d = await res.json(); showToast(d.error ?? '오류', 'error'); }
    } catch { showToast('네트워크 오류', 'error'); }
    finally { setActionLoading(null); setRejectCancelTarget(null); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          reservation={rejectTarget}
          onConfirm={(reason) => handleReject(rejectTarget.id, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          reservation={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {rejectCancelTarget && (
        <RejectCancelModal
          reservation={rejectCancelTarget}
          onConfirm={(reason) => handleRejectCancellation(rejectCancelTarget.id, reason)}
          onCancel={() => setRejectCancelTarget(null)}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-gray-700 p-1 rounded transition"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">관리자 모드</h1>
            <p className="text-xs text-gray-500">오레곤벧엘교회 예약 관리</p>
          </div>
          {pendingCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
              대기 {pendingCount}건
            </span>
          )}
          {cancellationRequestedCount > 0 && (
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
              취소 신청 {cancellationRequestedCount}건
            </span>
          )}
          <button
            onClick={async () => {
              await fetch('/api/admin/auth', { method: 'DELETE' });
              onLogout();
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-4 py-6">
        {/* Filter tabs + bulk actions */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['pending', 'approved', 'cancellation_requested', 'all'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(new Set()); }}
                className={`px-3 py-2 font-medium transition border-l first:border-l-0 border-gray-200 ${
                  filter === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'pending' ? '승인 대기' : f === 'approved' ? '승인 완료' : f === 'cancellation_requested' ? '취소 신청' : '전체'}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5">{pendingCount}</span>
                )}
                {f === 'cancellation_requested' && cancellationRequestedCount > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5">{cancellationRequestedCount}</span>
                )}
              </button>
            ))}
          </div>

          {filter === 'pending' && selectedPendingCount > 0 && (
            <button
              onClick={handleApproveSelected}
              disabled={bulkLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm rounded-lg font-medium transition"
            >
              {bulkLoading ? '처리 중...' : `선택 승인 (${selectedPendingCount}건)`}
            </button>
          )}
          <button
            onClick={fetchReservations}
            className="ml-auto px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition"
          >
            새로고침
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {filter === 'pending' ? '승인 대기 중인 예약이 없습니다.' : '예약 내역이 없습니다.'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {filter === 'pending' && (
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={filtered.filter((r) => r.status === 'pending').every((r) => selected.has(r.id))}
                            onChange={toggleSelectAll}
                            className="rounded"
                          />
                        </th>
                      )}
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">상태</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">제목</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">장소</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">시간</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">담당자</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">신청일시</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => (
                      <tr key={r.id} className={`hover:bg-gray-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                        {filter === 'pending' && (
                          <td className="px-4 py-3">
                            {r.status === 'pending' && (
                              <input
                                type="checkbox"
                                checked={selected.has(r.id)}
                                onChange={() => toggleSelect(r.id)}
                                className="rounded"
                              />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <div>{r.title}</div>
                          {r.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{r.notes}</div>}
                          {r.status === 'cancellation_requested' && r.cancellation_reason && (
                            <div className="text-xs text-amber-700 mt-0.5 truncate max-w-xs">취소 사유: {r.cancellation_reason}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.room_color }} />
                            <span className="text-gray-700">{r.room_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          <div>{formatDateTime(r.start_time)}</div>
                          <div className="text-xs text-gray-400">~ {formatDateTime(r.end_time)}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.person_in_charge}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <ActionButtons
                            reservation={r}
                            loading={actionLoading === r.id}
                            onApprove={() => handleApprove(r.id)}
                            onReject={() => setRejectTarget(r)}
                            onDelete={() => setDeleteTarget(r)}
                            onApproveCancellation={() => handleApproveCancellation(r.id)}
                            onRejectCancellation={() => setRejectCancelTarget(r)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {filtered.map((r) => (
                  <div key={r.id} className={`p-4 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {filter === 'pending' && r.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            className="rounded mt-0.5"
                          />
                        )}
                        <StatusBadge status={r.status} />
                      </div>
                      <span className="text-xs text-gray-400">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="font-semibold text-gray-800 mb-1">{r.title}</p>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.room_color }} />
                      <span className="text-sm text-gray-600">{r.room_name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      {formatDateTime(r.start_time)} ~ {formatDateTime(r.end_time)}
                    </p>
                    <p className="text-xs text-gray-500 mb-3">담당: {r.person_in_charge}</p>
                    {r.notes && <p className="text-xs text-gray-400 mb-3 italic">{r.notes}</p>}
                    {r.status === 'cancellation_requested' && r.cancellation_reason && (
                      <p className="text-xs text-amber-700 mb-3">취소 사유: {r.cancellation_reason}</p>
                    )}
                    {r.status === 'rejected' && r.rejection_reason && (
                      <p className="text-xs text-red-500 mb-3">거절 사유: {r.rejection_reason}</p>
                    )}
                    <div className="flex gap-2">
                      <ActionButtons
                        reservation={r}
                        loading={actionLoading === r.id}
                        onApprove={() => handleApprove(r.id)}
                        onReject={() => setRejectTarget(r)}
                        onDelete={() => setDeleteTarget(r)}
                        onApproveCancellation={() => handleApproveCancellation(r.id)}
                        onRejectCancellation={() => setRejectCancelTarget(r)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Rejection reason display in 'all' view */}
        {filter === 'all' && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            거절된 예약은 캘린더에 표시되지 않습니다.
          </p>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
      승인 대기
    </span>
  );
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      승인 완료
    </span>
  );
  if (status === 'cancellation_requested') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      취소 신청
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      거절
    </span>
  );
}

function ActionButtons({
  reservation,
  loading,
  onApprove,
  onReject,
  onDelete,
  onApproveCancellation,
  onRejectCancellation,
}: {
  reservation: ReservationWithRoom;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onApproveCancellation: () => void;
  onRejectCancellation: () => void;
}) {
  if (reservation.status === 'pending') {
    return (
      <div className="flex gap-1.5">
        <button
          onClick={onApprove}
          disabled={loading}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
        >
          {loading ? '...' : '승인'}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
        >
          거절
        </button>
      </div>
    );
  }

  if (reservation.status === 'approved') {
    return (
      <button
        onClick={onDelete}
        disabled={loading}
        className="px-3 py-1.5 border border-red-300 hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs rounded-lg transition"
      >
        {loading ? '...' : '삭제'}
      </button>
    );
  }

  if (reservation.status === 'cancellation_requested') {
    return (
      <div className="flex gap-1.5">
        <button
          onClick={onApproveCancellation}
          disabled={loading}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
        >
          {loading ? '...' : '취소 승인'}
        </button>
        <button
          onClick={onRejectCancellation}
          disabled={loading}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
        >
          취소 거절
        </button>
      </div>
    );
  }

  if (reservation.status === 'rejected') {
    return (
      <span className="text-xs text-gray-400 italic">
        {reservation.rejection_reason ? `사유: ${reservation.rejection_reason}` : ''}
      </span>
    );
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authState, setAuthState] = useState<'checking' | 'login' | 'authenticated'>('checking');

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((d) => setAuthState(d.authenticated ? 'authenticated' : 'login'))
      .catch(() => setAuthState('login'));
  }, []);

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">확인 중...</div>
      </div>
    );
  }

  if (authState === 'login') {
    return <LoginScreen onSuccess={() => setAuthState('authenticated')} />;
  }

  return <AdminPanel onLogout={() => setAuthState('login')} />;
}
