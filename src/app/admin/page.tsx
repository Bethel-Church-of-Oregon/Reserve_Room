'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ReservationWithRoom, NotificationRecipient } from '@/lib/db';
import { useLanguage } from '@/contexts/LanguageContext';
import { pacificTodayDate, toDateKey } from '@/lib/date';
import { LIMITS } from '@/lib/constants';
import { EditRequestModal } from '@/components/ReservationDetailPopover';

type FilterStatus = 'pending' | 'approved' | 'cancelled' | 'all';

/** '5039545830' → '(503) 954-5830'; anything unexpected is shown as-is. */
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function formatDateTime(dt: string): string {
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatSeriesRangeLines(reservations: ReservationWithRoom[]): { firstStart: string; lastEnd: string; count: number } | null {
  if (reservations.length === 0) return null;
  const byStart = [...reservations].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const firstStart = formatDateTime(byStart[0].start_time);
  const lastEnd = formatDateTime(byStart[byStart.length - 1].end_time);
  return { firstStart, lastEnd, count: reservations.length };
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { lang, setLang, t } = useLanguage();

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
        setError(data.error ?? t.errGeneral);
      } else {
        sessionStorage.setItem('adminVerified', '1');
        onSuccess();
      }
    } catch {
      setError(t.errNetwork);
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
          <h1 className="text-xl font-bold text-gray-800">{t.adminLoginTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.adminLoginSubtitle}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">{t.adminPasswordLabel}</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder={t.adminPasswordPlaceholder}
              autoFocus
              className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-gray-700 ${
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
            {loading ? t.adminLoginLoading : t.adminLoginBtn}
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            {t.adminGoBack}
          </button>
        </form>
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            className="px-2.5 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>
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
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.rejectTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">
          <strong className="text-gray-700">{reservation.title}</strong> — {t.rejectDesc(reservation.title).replace(`"${reservation.title}" `, '')}
        </p>
        <div className="mb-4">
          <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">{t.rejectReasonLabel} <span className="text-red-500">*</span></label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder={t.rejectReasonPlaceholder}
            rows={3}
            autoFocus
            className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 resize-none ${
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
            {t.btnCancel}
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) { setError(t.errRejectReasonRequired); return; }
              onConfirm(reason.trim());
            }}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnRejectConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject Series Modal ──────────────────────────────────────────────────────
function RejectSeriesModal({
  seriesId,
  title,
  roomName,
  count,
  onConfirm,
  onCancel,
}: {
  seriesId: string;
  title: string;
  roomName: string;
  count: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.rejectSeriesTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{t.rejectSeriesDesc(title, roomName, count)}</p>
        <div className="mb-4">
          <label htmlFor="reject-series-reason" className="block text-sm font-medium text-gray-700 mb-1">{t.rejectReasonLabel} <span className="text-red-500">*</span></label>
          <textarea
            id="reject-series-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder={t.rejectReasonPlaceholder}
            rows={3}
            autoFocus
            className={`w-full border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 resize-none ${
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
            {t.btnCancel}
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) { setError(t.errRejectReasonRequired); return; }
              onConfirm(reason.trim());
            }}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnRejectConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject Cancel Series Modal ───────────────────────────────────────────────
function RejectCancelSeriesModal({
  title,
  roomName,
  count,
  onConfirm,
  onCancel,
}: {
  title: string;
  roomName: string;
  count: number;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.rejectCancelSeriesTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{t.rejectCancelSeriesDesc(title, roomName, count)}</p>
        <div className="mb-4">
          <label htmlFor="reject-cancel-series-reason" className="block text-sm font-medium text-gray-700 mb-1">{t.rejectCancelReasonOptional}</label>
          <textarea
            id="reject-cancel-series-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.rejectCancelPlaceholderOptional}
            rows={3}
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            {t.btnClose}
          </button>
          <button
            onClick={() => onConfirm(reason.trim() || undefined)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnRejectCancelConfirm}
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
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{t.rejectCancelTitle}</h3>
        <p className="text-sm text-gray-500 mb-4">{t.rejectCancelDesc(reservation.title)}</p>
        <div className="mb-4">
          <label htmlFor="reject-cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">{t.rejectCancelReasonOptional}</label>
          <textarea
            id="reject-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.rejectCancelPlaceholderOptional}
            rows={3}
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            {t.btnClose}
          </button>
          <button
            onClick={() => onConfirm(reason.trim() || undefined)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnRejectCancelConfirm}
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
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-2">{t.deleteTitle}</h3>
        <p className="text-sm text-gray-600 mb-1">{t.deleteConfirmMsg}</p>
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-gray-800">{reservation.title}</p>
          <p className="text-gray-500">{reservation.room_name}</p>
          <p className="text-gray-500">{formatDateTime(reservation.start_time)} ~ {formatDateTime(reservation.end_time)}</p>
        </div>
        <p className="text-xs text-red-500 mb-4">{t.deleteWarning}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition"
          >
            {t.btnCancel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
          >
            {t.btnDeleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const { lang, setLang, t, tRoom } = useLanguage();
  const [reservations, setReservations] = useState<ReservationWithRoom[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterStatus>('approved');
  const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());
  const [roomFilterOpen, setRoomFilterOpen] = useState(false);
  const [allRooms, setAllRooms] = useState<{ id: number; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<ReservationWithRoom | null>(null);
  const [rejectSeriesTarget, setRejectSeriesTarget] = useState<{ seriesId: string; title: string; roomName: string; count: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReservationWithRoom | null>(null);
  const [detailTarget, setDetailTarget] = useState<ReservationWithRoom | null>(null);
  const [editTarget, setEditTarget] = useState<ReservationWithRoom | null>(null);
  const [rejectCancelTarget, setRejectCancelTarget] = useState<ReservationWithRoom | null>(null);
  const [rejectCancelSeriesTarget, setRejectCancelSeriesTarget] = useState<{
    seriesId: string;
    title: string;
    roomName: string;
    count: number;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [seriesActionLoading, setSeriesActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [adminView, setAdminView] = useState<'reservations' | 'settings'>('reservations');
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeSaved, setAccessCodeSaved] = useState('');
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const yesterday = pacificTodayDate();
      yesterday.setDate(yesterday.getDate() - 1);
      const from = toDateKey(yesterday);
      const res = await fetch(`/api/admin/reservations?from=${from}`);
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setReservations(Array.isArray(data) ? data : []);
    } catch {
      showToast(t.adminDataError, 'error');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);
  useEffect(() => {
    fetch('/api/rooms?all=true').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAllRooms(data);
    }).catch(() => {});
  }, []);

  const fetchRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    try {
      const res = await fetch('/api/admin/recipients');
      if (res.ok) {
        const data = await res.json();
        setRecipients(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    finally { setRecipientsLoading(false); }
  }, []);

  const fetchAccessCode = useCallback(async () => {
    setAccessCodeLoading(true);
    try {
      const res = await fetch('/api/admin/access-code');
      if (res.status === 401) { onLogout(); return; }
      const d = await res.json();
      setAccessCode(d.code ?? '');
      setAccessCodeSaved(d.code ?? '');
    } catch {
      showToast(t.adminDataError, 'error');
    } finally {
      setAccessCodeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLogout]);

  useEffect(() => {
    // Notification recipients live inside Settings, so both loads happen together.
    if (adminView === 'settings') { fetchAccessCode(); fetchRecipients(); }
  }, [adminView, fetchRecipients, fetchAccessCode]);

  const uniqueRooms = allRooms.length > 0 ? allRooms : Array.from(
    new Map(reservations.map(r => [r.room_id, { id: r.room_id, name: r.room_name, color: r.room_color }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const filtered = reservations.filter((r) => {
    if (filter === 'pending' && r.status !== 'pending') return false;
    if (filter === 'approved' && r.status !== 'approved') return false;
    if (filter === 'cancelled' && r.status !== 'cancelled') return false;
    if (filter === 'all' && r.status === 'rejected') return false;
    if (selectedRooms.size > 0 && !selectedRooms.has(r.room_id)) return false;
    return true;
  });

  type DisplayRow =
    | { type: 'series'; seriesId: string; reservations: ReservationWithRoom[] }
    | { type: 'single'; reservation: ReservationWithRoom };

  function buildGroupedRows(): DisplayRow[] {
    const rows: DisplayRow[] = [];
    const seenSeries = new Set<string>();
    for (const r of filtered) {
      if (r.series_id) {
        if (!seenSeries.has(r.series_id)) {
          seenSeries.add(r.series_id);
          const group = filtered.filter((x) => x.series_id === r.series_id);
          const asSingle = filter === 'cancelled' && group.length === 1;
          if (asSingle) {
            rows.push({ type: 'single', reservation: group[0] });
          } else {
            rows.push({ type: 'series', seriesId: r.series_id, reservations: group });
          }
        }
      } else {
        rows.push({ type: 'single', reservation: r });
      }
    }
    return rows;
  }

  const pendingRows: DisplayRow[] =
    filter === 'pending' ? buildGroupedRows() : filtered.map((r) => ({ type: 'single' as const, reservation: r }));
  const cancellationRows: DisplayRow[] =
    filtered.map((r) => ({ type: 'single' as const, reservation: r }));

  const displayRows: DisplayRow[] =
    filter === 'pending' ? pendingRows : filter === 'cancelled' ? cancellationRows : filtered.map((r) => ({ type: 'single' as const, reservation: r }));

  const pendingSingleIds = filter === 'pending' ? filtered.filter((r) => !r.series_id).map((r) => r.id) : [];

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const ids = filter === 'pending' ? pendingSingleIds : filtered.filter((r) => r.status === 'pending').map((r) => r.id);
    if (ids.length > 0 && ids.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ids));
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
      if (res.ok) { showToast(t.toastApproved); fetchReservations(); setSelected((p) => { const n = new Set(p); n.delete(id); return n; }); }
      else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
    } catch { showToast(t.toastNetworkError, 'error'); }
    finally { setActionLoading(null); }
  }

  async function handleApproveSeries(seriesId: string) {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t.toastSeriesApproved(data.approved ?? 0));
        setSelected(new Set());
        fetchReservations();
      } else {
        showToast(data.error ?? t.toastError, 'error');
      }
    } catch {
      showToast(t.toastNetworkError, 'error');
    } finally {
      setBulkLoading(false);
    }
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
        showToast(t.toastBulkApproved(data.approved));
        setSelected(new Set());
        fetchReservations();
      } else {
        showToast(data.error ?? t.toastError, 'error');
      }
    } catch {
      showToast(t.toastNetworkError, 'error');
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
      if (res.ok) { showToast(t.toastRejected); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
    } catch { showToast(t.toastNetworkError, 'error'); }
    finally { setActionLoading(null); setRejectTarget(null); }
  }

  async function handleRejectSeries(seriesId: string, reason: string) {
    setSeriesActionLoading(seriesId);
    try {
      const res = await fetch(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t.toastSeriesRejected(data.rejected ?? 0));
        fetchReservations();
        setRejectSeriesTarget(null);
      } else {
        showToast(data.error ?? t.toastError, 'error');
      }
    } catch {
      showToast(t.toastNetworkError, 'error');
    } finally {
      setSeriesActionLoading(null);
      setRejectSeriesTarget(null);
    }
  }

  async function handleDelete(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast(t.toastDeleted); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
    } catch { showToast(t.toastNetworkError, 'error'); }
    finally { setActionLoading(null); setDeleteTarget(null); }
  }

  const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length;
  const selectedPendingCount = Array.from(selected).filter((id) => reservations.find((r) => r.id === id)?.status === 'pending').length;

  async function handleApproveCancellation(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_cancellation' }),
      });
      if (res.ok) { showToast(t.toastCancelApproved); fetchReservations(); }
      else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
    } catch { showToast(t.toastNetworkError, 'error'); }
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
      if (res.ok) { showToast(t.toastCancelRejected); fetchReservations(); setRejectCancelTarget(null); }
      else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
    } catch { showToast(t.toastNetworkError, 'error'); }
    finally { setActionLoading(null); setRejectCancelTarget(null); }
  }

  async function handleApproveCancellationSeries(seriesId: string) {
    setSeriesActionLoading(seriesId);
    try {
      const res = await fetch(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_cancellation' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t.toastSeriesCancelApproved(data.approved ?? 0));
        fetchReservations();
      } else {
        showToast(data.error ?? t.toastError, 'error');
      }
    } catch {
      showToast(t.toastNetworkError, 'error');
    } finally {
      setSeriesActionLoading(null);
    }
  }

  async function handleRejectCancellationSeries(seriesId: string, reason?: string) {
    setSeriesActionLoading(seriesId);
    try {
      const res = await fetch(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_cancellation', reason: reason ?? '' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t.toastSeriesCancelRejected(data.rejected ?? 0));
        fetchReservations();
        setRejectCancelSeriesTarget(null);
      } else {
        showToast(data.error ?? t.toastError, 'error');
      }
    } catch {
      showToast(t.toastNetworkError, 'error');
    } finally {
      setSeriesActionLoading(null);
      setRejectCancelSeriesTarget(null);
    }
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
      {rejectSeriesTarget && (
        <RejectSeriesModal
          seriesId={rejectSeriesTarget.seriesId}
          title={rejectSeriesTarget.title}
          roomName={rejectSeriesTarget.roomName}
          count={rejectSeriesTarget.count}
          onConfirm={(reason) => handleRejectSeries(rejectSeriesTarget.seriesId, reason)}
          onCancel={() => setRejectSeriesTarget(null)}
        />
      )}
      {detailTarget && (
        <ReservationDetailModal
          reservation={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
      {editTarget && (
        <EditRequestModal
          admin
          reservation={editTarget}
          onConfirm={() => {
            setEditTarget(null);
            showToast(t.toastEdited);
            fetchReservations();
          }}
          onCancel={() => setEditTarget(null)}
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
      {rejectCancelSeriesTarget && (
        <RejectCancelSeriesModal
          title={rejectCancelSeriesTarget.title}
          roomName={rejectCancelSeriesTarget.roomName}
          count={rejectCancelSeriesTarget.count}
          onConfirm={(reason) => handleRejectCancellationSeries(rejectCancelSeriesTarget.seriesId, reason)}
          onCancel={() => setRejectCancelSeriesTarget(null)}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-gray-700 p-1 rounded transition"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{t.adminTitle}</h1>
            <p className="text-xs text-gray-500 truncate">{t.adminSubtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            className="px-2.5 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
          <button
            onClick={async () => {
              await fetch('/api/admin/auth', { method: 'DELETE' });
              sessionStorage.removeItem('adminVerified');
              onLogout();
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
          >
            {t.adminLogout}
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        {/* Filter tabs + bulk actions. Wraps rather than overflowing: the row is
            tuned to fit one line at 360px, and anything narrower breaks onto a
            second line instead of running off the side of the screen. */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-4">
          <button
            onClick={() => router.push('/reserve?admin=true')}
            className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition whitespace-nowrap"
            style={{ fontSize: 'clamp(10px, 3.5vw, 14px)', padding: '8px clamp(4px, 1.5vw, 12px)' }}
          >
            {t.adminReserveBtn}
          </button>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0" style={{ fontSize: 'clamp(10px, 3.5vw, 14px)' }}>
            {(['approved', 'cancelled', 'all'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(new Set()); setAdminView('reservations'); }}
                style={{ padding: '8px clamp(4px, 1.5vw, 12px)' }}
                className={`font-medium transition border-l first:border-l-0 border-gray-200 whitespace-nowrap ${
                  adminView === 'reservations' && filter === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'approved' ? t.adminTabReservations : f === 'cancelled' ? t.adminTabCancellations : t.adminTabAll}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAdminView(v => v === 'settings' ? 'reservations' : 'settings')}
            style={{ fontSize: 'clamp(10px, 3.5vw, 14px)', padding: '8px clamp(4px, 1.5vw, 12px)' }}
            className={`flex-shrink-0 rounded-lg border font-medium transition whitespace-nowrap ${
              adminView === 'settings' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.adminTabSettings}
          </button>
          <button
            onClick={adminView === 'settings' ? () => { fetchAccessCode(); fetchRecipients(); } : fetchReservations}
            className="ml-auto border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition whitespace-nowrap flex-shrink-0"
            style={{ fontSize: 'clamp(10px, 3.5vw, 14px)', padding: '8px clamp(6px, 2vw, 12px)' }}
          >
            <span className="min-[420px]:hidden">↻</span>
            <span className="hidden min-[420px]:inline">{t.btnRefresh}</span>
          </button>
        </div>

        {adminView === 'settings' && (
          <div className="max-w-lg">
            <h2 className="text-base font-bold text-gray-800 mb-1">{t.settingsTitle}</h2>
            <p className="text-xs text-gray-500 mb-5">{t.settingsDesc}</p>

            {accessCodeLoading ? (
              <div className="text-sm text-gray-400 py-4">{t.loading}</div>
            ) : (
              <>
                <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                  accessCodeSaved
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {accessCodeSaved ? t.settingsEnabled(accessCodeSaved) : t.settingsDisabled}
                </div>

                <label htmlFor="admin-access-code" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.settingsCodeLabel}
                </label>
                <div className="flex gap-2">
                  <input
                    id="admin-access-code"
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder={t.settingsCodePlaceholder}
                    autoComplete="off"
                    maxLength={LIMITS.accessCode}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <button
                    onClick={async () => {
                      setAccessCodeLoading(true);
                      try {
                        const res = await fetch('/api/admin/access-code', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ code: accessCode.trim() }),
                        });
                        const d = await res.json();
                        if (res.ok) {
                          setAccessCode(d.code ?? '');
                          setAccessCodeSaved(d.code ?? '');
                          showToast(t.settingsSaved);
                        } else {
                          showToast(d.error ?? t.toastError, 'error');
                        }
                      } catch {
                        showToast(t.toastNetworkError, 'error');
                      } finally {
                        setAccessCodeLoading(false);
                      }
                    }}
                    disabled={accessCodeLoading || accessCode.trim() === accessCodeSaved}
                    className="flex-shrink-0 px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  >
                    {t.settingsSave}
                  </button>
                </div>
                <p className="mt-3 text-xs text-gray-400">{t.settingsWarn}</p>
              </>
            )}
          </div>
        )}

        {/* Second section of Settings. It used to be a top-level tab, but the button
            row overflowed the width of a phone; folding it in here removes a button
            and groups it with the other church-wide setting. */}
        {adminView === 'settings' && (
          <div className="max-w-lg mt-10 pt-8 border-t border-gray-200">
            <h2 className="text-base font-bold text-gray-800 mb-1">{t.recipientsTitle}</h2>
            <p className="text-xs text-gray-500 mb-5">{t.recipientsDesc}</p>

            {/* Add form */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
                    placeholder={t.recipientNamePlaceholder}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => { setNewPhone(e.target.value.replace(/\D/g, '')); setAddError(''); }}
                    placeholder={t.recipientPhonePlaceholder}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (!newName.trim()) { setAddError(t.errRecipientName); return; }
                      if (newPhone.length < 10) { setAddError(t.errRecipientPhone); return; }
                      setAddLoading(true);
                      try {
                        const res = await fetch('/api/admin/recipients', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: newName.trim(), phone: newPhone }),
                        });
                        if (res.ok) {
                          setNewName(''); setNewPhone('');
                          showToast(t.recipientAdded);
                          fetchRecipients();
                        } else {
                          const d = await res.json();
                          setAddError(d.error ?? t.errGeneral);
                        }
                      } catch { setAddError(t.errNetwork); }
                      finally { setAddLoading(false); }
                    }}
                    disabled={addLoading}
                    className="flex-shrink-0 px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
                  >
                    {t.recipientAdd}
                  </button>
                </div>
                {addError && <p className="text-xs text-red-500">{addError}</p>}
              </div>
            </div>

            {/* Recipients list */}
            {recipientsLoading ? (
              <div className="text-sm text-gray-400 py-4">{t.loading}</div>
            ) : recipients.length === 0 ? (
              <div className="text-sm text-gray-400 py-4">{t.noRecipients}</div>
            ) : (
              <div className="space-y-2">
                {recipients.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-500">{formatPhone(r.phone)}</div>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/admin/recipients/${r.id}`, { method: 'DELETE' });
                        if (res.ok) { showToast(t.recipientDeleted); fetchRecipients(); }
                        else { const d = await res.json(); showToast(d.error ?? t.toastError, 'error'); }
                      }}
                      className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1.5 transition"
                    >
                      {t.btnDelete}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Room filter */}
        {adminView === 'reservations' && uniqueRooms.length > 0 && (
          <div className="relative border-b border-gray-100 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
            <div className="relative z-50 flex items-center gap-2 py-2">
              <button
                onClick={() => setRoomFilterOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition whitespace-nowrap flex-shrink-0 ${roomFilterOpen ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className={selectedRooms.size > 0 ? 'hidden sm:inline' : ''}>{t.roomFilter}</span>
                {selectedRooms.size > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs leading-none">{selectedRooms.size}</span>
                )}
                <span className="text-gray-400">{roomFilterOpen ? t.filterCollapse : t.filterExpand}</span>
              </button>
              {selectedRooms.size > 0 && !roomFilterOpen && (
                <button
                  onClick={() => setSelectedRooms(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 underline transition whitespace-nowrap flex-shrink-0"
                >
                  {t.showAll}
                </button>
              )}
              {selectedRooms.size > 0 && roomFilterOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedRooms(new Set()); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline transition whitespace-nowrap flex-shrink-0"
                >
                  {t.deselect}
                </button>
              )}
            </div>

            {!roomFilterOpen && selectedRooms.size > 0 && (
              <div className="pb-2 flex flex-wrap gap-x-2 gap-y-1.5">
                {uniqueRooms.filter(r => selectedRooms.has(r.id)).map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRooms(prev => { const n = new Set(prev); n.delete(room.id); return n; })}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition border-transparent text-white font-medium"
                    style={{ backgroundColor: room.color }}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.7)' }} />
                    {tRoom(room.name)}
                  </button>
                ))}
              </div>
            )}

            {roomFilterOpen && (
              <>
                <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setRoomFilterOpen(false)} />
                <div className="sm:relative sm:z-auto sm:shadow-none sm:border-0 sm:bg-transparent sm:px-0 sm:pb-2 sm:pt-0 absolute left-0 right-0 z-50 bg-white shadow-lg border-t border-gray-200 px-3 pb-3 pt-2">
                  <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                    {uniqueRooms.map(room => {
                      const active = selectedRooms.has(room.id);
                      return (
                        <button
                          key={room.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedRooms(prev => { const n = new Set(prev); active ? n.delete(room.id) : n.add(room.id); return n; }); }}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition ${active ? 'border-transparent text-white font-medium' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
                          style={active ? { backgroundColor: room.color, borderColor: room.color } : {}}
                        >
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : room.color }} />
                          {tRoom(room.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Table */}
        {adminView === 'reservations' && <>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">{t.loading}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {selectedRooms.size > 0 ? t.adminNoRoomFilter : filter === 'pending' ? t.adminNoPending : t.adminNoReservations}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden admin:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {filter === 'pending' && (
                        <th className="w-10 px-4 py-3">
                          {pendingSingleIds.length > 0 && (
                            <input
                              type="checkbox"
                              checked={pendingSingleIds.every((id) => selected.has(id))}
                              onChange={toggleSelectAll}
                              className="rounded"
                            />
                          )}
                        </th>
                      )}
                      {filter === 'all' && <th className="text-left px-3 py-2 text-gray-600 font-medium w-px whitespace-nowrap">{t.colStatus}</th>}
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">{t.colTitle}</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium w-[160px]">{t.colRoom}</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium w-[160px] whitespace-nowrap">{t.colTime}</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium w-[120px] whitespace-nowrap">{t.colPerson}</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium w-[140px] whitespace-nowrap">{t.colCreatedAt}</th>
                      <th className="px-3 py-2 w-px" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRows.map((row) =>
                      row.type === 'series' ? (
                        <tr key={row.seriesId} className="hover:bg-gray-50">
                          {filter === 'all' && <td className="px-3 py-2"><StatusBadge status={row.reservations[0].status} /></td>}
                          <td className="px-3 py-2 font-medium text-gray-800 w-[120px] max-w-[120px]">
                            <div className="truncate">{row.reservations[0].title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{t.seriesCount(row.reservations.length)}</div>
                            {row.reservations[0].notes && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{row.reservations[0].notes}</div>
                            )}
                            {filter === 'cancelled' && row.reservations[0].cancellation_reason && (
                              <div className="text-xs text-amber-700 mt-0.5 truncate max-w-xs">{t.cancelReasonPrefix}{row.reservations[0].cancellation_reason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 w-[160px] max-w-[160px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.reservations[0].room_color }} />
                              <span className="text-gray-700 truncate">{tRoom(row.reservations[0].room_name)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {(() => {
                              const lines = formatSeriesRangeLines(row.reservations);
                              return lines ? (
                                <>
                                  <div>{lines.firstStart}</div>
                                  <div className="text-xs text-gray-400">~ {lines.lastEnd} ({t.seriesCountSuffix(lines.count)})</div>
                                </>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.reservations[0].person_in_charge}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(row.reservations[0].created_at)}</td>
                          <td className="px-3 py-2">
                            {filter === 'pending' ? (
                              <div className="flex gap-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => handleApproveSeries(row.seriesId)}
                                  disabled={seriesActionLoading === row.seriesId || bulkLoading}
                                  className="px-2 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
                                >
                                  {seriesActionLoading === row.seriesId ? '...' : t.btnApproveSeries}
                                </button>
                                <button
                                  onClick={() =>
                                    setRejectSeriesTarget({
                                      seriesId: row.seriesId,
                                      title: row.reservations[0].title,
                                      roomName: row.reservations[0].room_name,
                                      count: row.reservations.length,
                                    })
                                  }
                                  disabled={seriesActionLoading === row.seriesId || bulkLoading}
                                  className="px-2 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
                                >
                                  {t.btnRejectSeries}
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => handleApproveCancellationSeries(row.seriesId)}
                                  disabled={seriesActionLoading === row.seriesId || bulkLoading}
                                  className="px-2 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
                                >
                                  {seriesActionLoading === row.seriesId ? '...' : t.btnApproveCancelSeries}
                                </button>
                                <button
                                  onClick={() =>
                                    setRejectCancelSeriesTarget({
                                      seriesId: row.seriesId,
                                      title: row.reservations[0].title,
                                      roomName: row.reservations[0].room_name,
                                      count: row.reservations.length,
                                    })
                                  }
                                  disabled={seriesActionLoading === row.seriesId || bulkLoading}
                                  className="px-2 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
                                >
                                  {t.btnRejectCancelSeries}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.reservation.id} className={`hover:bg-gray-50 ${selected.has(row.reservation.id) ? 'bg-blue-50' : ''}`}>
                          {filter === 'pending' && (
                            <td className="px-3 py-2">
                              {row.reservation.status === 'pending' && (
                                <input
                                  type="checkbox"
                                  checked={selected.has(row.reservation.id)}
                                  onChange={() => toggleSelect(row.reservation.id)}
                                  className="rounded"
                                />
                              )}
                            </td>
                          )}
                          {filter === 'all' && <td className="px-3 py-2"><StatusBadge status={row.reservation.status} /></td>}
                          <td className="px-3 py-2 font-medium text-gray-800 w-[120px] max-w-[120px]">
                            <div className="truncate">{row.reservation.title}</div>
                            {row.reservation.notes && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{row.reservation.notes}</div>
                            )}
                            {row.reservation.status === 'cancelled' && row.reservation.cancellation_reason && (
                              <div className="text-xs text-amber-700 mt-0.5 truncate max-w-xs">{t.cancelReasonPrefix}{row.reservation.cancellation_reason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 w-[160px] max-w-[160px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.reservation.room_color }} />
                              <span className="text-gray-700 truncate">{tRoom(row.reservation.room_name)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            <div>{formatDateTime(row.reservation.start_time)}</div>
                            <div className="text-xs text-gray-400">~ {formatDateTime(row.reservation.end_time)}</div>
                          </td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.reservation.person_in_charge}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(row.reservation.created_at)}</td>
                          <td className="px-3 py-2 w-px">
                            <ActionButtons
                              reservation={row.reservation}
                              loading={actionLoading === row.reservation.id}
                              onDetail={() => setDetailTarget(row.reservation)}
                              onEdit={() => setEditTarget(row.reservation)}
                              onApprove={() => handleApprove(row.reservation.id)}
                              onReject={() => setRejectTarget(row.reservation)}
                              onDelete={() => setDeleteTarget(row.reservation)}
                              onApproveCancellation={() => handleApproveCancellation(row.reservation.id)}
                              onRejectCancellation={() => setRejectCancelTarget(row.reservation)}
                            />
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="admin:hidden divide-y divide-gray-100">
                {displayRows.map((row) =>
                  row.type === 'series' ? (
                    <div key={row.seriesId} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        {filter === 'all' ? <StatusBadge status={row.reservations[0].status} /> : <span />}
                        <span className="text-xs text-gray-400">{formatDateTime(row.reservations[0].created_at)}</span>
                      </div>
                      <p className="font-semibold text-gray-800 mb-1 truncate">{row.reservations[0].title}</p>
                      <p className="text-xs text-gray-500 mb-1">{t.seriesCount(row.reservations.length)}</p>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.reservations[0].room_color }} />
                        <span className="text-sm text-gray-600">{tRoom(row.reservations[0].room_name)}</span>
                      </div>
                      {(() => {
                        const seriesLines = formatSeriesRangeLines(row.reservations);
                        return seriesLines ? (
                          <div className="text-xs text-gray-500 mb-1">
                            <div>{seriesLines.firstStart}</div>
                            <div className="text-gray-400">~ {seriesLines.lastEnd} ({t.seriesCountSuffix(seriesLines.count)})</div>
                          </div>
                        ) : null;
                      })()}
                      <p className="text-xs text-gray-500 mb-3">{t.personLabelAdmin}{row.reservations[0].person_in_charge}</p>
                      {row.reservations[0].notes && <p className="text-xs text-gray-400 mb-3 italic">{row.reservations[0].notes}</p>}
                      {filter === 'cancelled' && row.reservations[0].cancellation_reason && (
                        <p className="text-xs text-amber-700 mb-3">{t.cancelReasonPrefix}{row.reservations[0].cancellation_reason}</p>
                      )}
                      <div className="flex gap-2">
                        {filter === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleApproveSeries(row.seriesId)}
                              disabled={seriesActionLoading === row.seriesId || bulkLoading}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
                            >
                              {seriesActionLoading === row.seriesId ? '...' : t.btnApproveSeries}
                            </button>
                            <button
                              onClick={() =>
                                setRejectSeriesTarget({
                                  seriesId: row.seriesId,
                                  title: row.reservations[0].title,
                                  roomName: row.reservations[0].room_name,
                                  count: row.reservations.length,
                                })
                              }
                              disabled={seriesActionLoading === row.seriesId || bulkLoading}
                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
                            >
                              {t.btnRejectSeries}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApproveCancellationSeries(row.seriesId)}
                              disabled={seriesActionLoading === row.seriesId || bulkLoading}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
                            >
                              {seriesActionLoading === row.seriesId ? '...' : t.btnApproveCancelSeries}
                            </button>
                            <button
                              onClick={() =>
                                setRejectCancelSeriesTarget({
                                  seriesId: row.seriesId,
                                  title: row.reservations[0].title,
                                  roomName: row.reservations[0].room_name,
                                  count: row.reservations.length,
                                })
                              }
                              disabled={seriesActionLoading === row.seriesId || bulkLoading}
                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
                            >
                              {t.btnRejectCancelSeries}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={row.reservation.id} className={`p-4 ${selected.has(row.reservation.id) ? 'bg-blue-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        {filter === 'all' ? <StatusBadge status={row.reservation.status} /> : <span />}
                        <span className="text-xs text-gray-400">{formatDateTime(row.reservation.created_at)}</span>
                      </div>
                      <p className="font-semibold text-gray-800 mb-1 truncate">{row.reservation.title}</p>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.reservation.room_color }} />
                        <span className="text-sm text-gray-600">{tRoom(row.reservation.room_name)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">
                        {formatDateTime(row.reservation.start_time)} ~ {formatDateTime(row.reservation.end_time)}
                      </p>
                      <p className="text-xs text-gray-500 mb-3">{t.personLabelAdmin}{row.reservation.person_in_charge}</p>
                      {row.reservation.notes && <p className="text-xs text-gray-400 mb-3 italic">{row.reservation.notes}</p>}
                      {row.reservation.status === 'cancelled' && row.reservation.cancellation_reason && (
                        <p className="text-xs text-amber-700 mb-3">{t.cancelReasonPrefix}{row.reservation.cancellation_reason}</p>
                      )}
                      {row.reservation.status === 'rejected' && row.reservation.rejection_reason && (
                        <p className="text-xs text-red-500 mb-3">{t.rejectionReasonPrefix}{row.reservation.rejection_reason}</p>
                      )}
                      <div className="flex gap-2">
                        <ActionButtons
                          reservation={row.reservation}
                          loading={actionLoading === row.reservation.id}
                          onDetail={() => setDetailTarget(row.reservation)}
                          onEdit={() => setEditTarget(row.reservation)}
                          onApprove={() => handleApprove(row.reservation.id)}
                          onReject={() => setRejectTarget(row.reservation)}
                          onDelete={() => setDeleteTarget(row.reservation)}
                          onApproveCancellation={() => handleApproveCancellation(row.reservation.id)}
                          onRejectCancellation={() => setRejectCancelTarget(row.reservation)}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {filter === 'all' && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            {t.adminRejectedNote}
          </p>
        )}
        </>}
      </main>
    </div>
  );
}

function ReservationDetailModal({ reservation, onClose }: { reservation: ReservationWithRoom; onClose: () => void }) {
  const { t, tRoom } = useLanguage();
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{t.detailTitle}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldTitle}</span>
            <span className="font-semibold text-gray-800">{reservation.title}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldStatus}</span>
            <StatusBadge status={reservation.status} />
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldRoom}</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: reservation.room_color }} />
              <span className="text-gray-700">{tRoom(reservation.room_name)}</span>
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldTime}</span>
            <span className="text-gray-700">{formatDateTime(reservation.start_time)} ~ {formatDateTime(reservation.end_time)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldPerson}</span>
            <span className="text-gray-700">{reservation.person_in_charge}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldEmail}</span>
            <span className="text-gray-700">{reservation.email}</span>
          </div>
          {reservation.notes && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldNotes}</span>
              <span className="text-gray-700">{reservation.notes}</span>
            </div>
          )}
          {reservation.rejection_reason && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldRejectionReason}</span>
              <span className="text-red-600">{reservation.rejection_reason}</span>
            </div>
          )}
          {reservation.cancellation_reason && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldCancelReason}</span>
              <span className="text-amber-700">{reservation.cancellation_reason}</span>
            </div>
          )}
          {reservation.previous_start_time && reservation.previous_end_time && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldPreviousTime}</span>
              <span className="text-gray-400 line-through">
                {formatDateTime(reservation.previous_start_time)} ~ {formatDateTime(reservation.previous_end_time)}
              </span>
            </div>
          )}
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldCreatedAt}</span>
            <span className="text-gray-500">{formatDateTime(reservation.created_at)}</span>
          </div>
          {reservation.updated_at && (
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">{t.detailFieldUpdatedAt}</span>
              <span className="text-gray-500">{formatDateTime(reservation.updated_at)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
      {t.statusPending}
    </span>
  );
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      {t.statusApproved}
    </span>
  );
  if (status === 'cancelled') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {t.statusCancelled}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {t.statusRejected}
    </span>
  );
}

function ActionButtons({
  reservation,
  loading,
  onDetail,
  onEdit,
  onApprove,
  onReject,
  onDelete,
  onApproveCancellation,
  onRejectCancellation,
}: {
  reservation: ReservationWithRoom;
  loading: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onApproveCancellation: () => void;
  onRejectCancellation: () => void;
}) {
  const { t } = useLanguage();

  const detailBtn = (
    <button
      onClick={onDetail}
      className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs rounded-lg transition"
    >
      {t.btnDetail}
    </button>
  );

  if (reservation.status === 'pending') {
    return (
      <div className="flex gap-1.5 whitespace-nowrap">
        {detailBtn}
        <button
          onClick={onApprove}
          disabled={loading}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition"
        >
          {loading ? '...' : t.btnApprove}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs rounded-lg font-medium transition"
        >
          {t.btnReject}
        </button>
      </div>
    );
  }

  if (reservation.status === 'approved') {
    return (
      <div className="flex gap-1.5 whitespace-nowrap">
        {detailBtn}
        <button
          onClick={onEdit}
          disabled={loading}
          className="px-3 py-1.5 border border-blue-300 hover:bg-blue-50 disabled:opacity-50 text-blue-600 text-xs rounded-lg transition"
        >
          {t.adminBtnEdit}
        </button>
        <button
          onClick={onDelete}
          disabled={loading}
          className="px-3 py-1.5 border border-red-300 hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs rounded-lg transition"
        >
          {loading ? '...' : t.btnDelete}
        </button>
      </div>
    );
  }

  if (reservation.status === 'cancelled') {
    return <div className="flex gap-1.5 whitespace-nowrap">{detailBtn}</div>;
  }

  if (reservation.status === 'rejected') {
    return (
      <div className="flex gap-1.5 whitespace-nowrap">
        {detailBtn}
      </div>
    );
  }

  return detailBtn;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { t } = useLanguage();
  const [authState, setAuthState] = useState<'checking' | 'login' | 'authenticated'>('checking');

  useEffect(() => {
    if (!sessionStorage.getItem('adminVerified')) {
      setAuthState('login');
      return;
    }
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((d) => setAuthState(d.authenticated ? 'authenticated' : 'login'))
      .catch(() => setAuthState('login'));
  }, []);

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">{t.adminChecking}</div>
      </div>
    );
  }

  if (authState === 'login') {
    return <LoginScreen onSuccess={() => setAuthState('authenticated')} />;
  }

  return <AdminPanel onLogout={() => setAuthState('login')} />;
}
