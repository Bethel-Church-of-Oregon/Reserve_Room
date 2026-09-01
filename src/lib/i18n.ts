export type Lang = 'ko' | 'en';

/** Building prefixes, translated separately from the room itself. */
export const buildingNameMap: Record<string, string> = {
  '비전홀': 'Vision Hall',
  '은혜성전': 'Grace Hall',
};

/**
 * Room names without the building prefix. Look these up through
 * `translateRoomName`, not directly: stored names carry the building prefix
 * ('은혜성전 친교실'), so a direct lookup on this map never matches.
 */
export const roomNameMap: Record<string, string> = {
  '대예배실': 'Main Sanctuary',
  '새가족실': 'New Members Room',
  '영아부실': 'Nursery',
  '유아부실': 'Toddler Room',
  '유치부실': 'Preschool Room',
  '찬양대실': 'Choir Room',
  '2층 교실 1': '2F Classroom 1',
  '2층 교실 2': '2F Classroom 2',
  '2층 교실 3': '2F Classroom 3',
  '2층 교실 4': '2F Classroom 4',
  '2층 올리브홀(초등부)': '2F Olive Hall (Elementary)',
  '2층 초등부 교사실': '2F Elementary Teachers Room',
  '예배실': 'Sanctuary',
  '친교실': 'Fellowship Hall',
  '2층 교실 302': '2F Classroom 302',
  '2층 교실 303': '2F Classroom 303',
  '2층 교실 305': '2F Classroom 305',
  '2층 교실 306': '2F Classroom 306',
  '청년부실': 'Youth Room',
  '(구)부교역자실': '(Former) Associate Pastors Office',
};

/**
 * '은혜성전 2층 교실 302' -> 'Grace Hall 2F Classroom 302'.
 * Anything unmapped falls back to the Korean text, so a new room shows up
 * readably even before it has a translation.
 */
export function translateRoomName(name: string): string {
  for (const [ko, en] of Object.entries(buildingNameMap)) {
    if (name.startsWith(`${ko} `)) {
      const room = name.slice(ko.length + 1);
      return `${en} ${roomNameMap[room] ?? room}`;
    }
  }
  return roomNameMap[name] ?? name;
}

// Date formatting utilities
export function formatMonthTitle(lang: Lang, d: Date): string {
  if (lang === 'en') return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export function formatDayTitle(lang: Lang, d: Date): string {
  if (lang === 'en') {
    const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${DAYS_EN[d.getDay()]})`;
  }
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
}

export function formatWeekTitle(lang: Lang, weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  if (lang === 'en') {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    if (sameMonth) {
      return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
  const s = `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일`;
  const e = weekEnd.getMonth() !== weekStart.getMonth()
    ? `${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일`
    : `${weekEnd.getDate()}일`;
  return `${s} – ${e}`;
}

export function formatListWeekLabel(lang: Lang, weekStartKey: string): string {
  const d = new Date(weekStartKey + 'T00:00:00');
  const we = new Date(d);
  we.setDate(d.getDate() + 6);
  if (lang === 'en') {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sameMonth = d.getMonth() === we.getMonth();
    if (sameMonth) {
      return `${MONTHS[d.getMonth()]} ${d.getDate()} – ${we.getDate()}, ${d.getFullYear()}`;
    }
    return `${MONTHS[d.getMonth()]} ${d.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`;
  }
  const startStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  const endStr = we.getMonth() !== d.getMonth()
    ? `${we.getMonth() + 1}월 ${we.getDate()}일`
    : `${we.getDate()}일`;
  return `${startStr} – ${endStr}`;
}

export function formatModalDayTitle(lang: Lang, d: Date): string {
  if (lang === 'en') {
    const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${DAYS_EN[d.getDay()]})`;
  }
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
}

export function formatTimeAmPm(lang: Lang, iso: string): string {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  if (lang === 'en') {
    const period = h < 12 ? 'AM' : 'PM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }
  const period = h < 12 ? '오전' : '오후';
  const hour = h % 12 || 12;
  return `${period} ${hour}:${m.toString().padStart(2, '0')}`;
}

// Translation strings
const ko = {
  // Site
  siteTitle: 'Bethel 장소예약시스템',
  siteTitleShort: 'Bethel 장소예약',

  // Header buttons
  btnReserve: '+ 장소 예약 신청',
  btnReserveShort: '+ 예약',
  btnAdmin: '관리자 모드',
  btnAdminShort: '관리자',

  // Notice banner
  noticeDesktop: '본 시스템은 소모임(사랑방, 사역팀 등) 전용 입니다. 결혼식 등 큰 행사는',
  noticeMobile: '소모임(사랑방, 사역팀 등) 전용 시스템입니다. 결혼식 등 큰 행사는',
  noticeLink: '사용신청서 작성',
  noticeSuffix: '  을 이용해 주세요.',

  // View modes
  viewDay: '일간',
  viewWeek: '주간',
  viewMonth: '월간',
  viewList: '목록',

  // Navigation
  today: '오늘',
  prev: '이전',
  next: '다음',

  // Room filter
  roomFilter: '장소 필터',
  filterCollapse: '접기',
  filterExpand: '열기',
  filterExpandLabel: '장소 필터 열기',
  filterCollapseLabel: '장소 필터 접기',
  showAll: '전체 보기',
  deselect: '선택 취소',
  loading: '불러오는 중...',
  monthHint: '원하시는 날짜를 클릭하시면, 해당 일자의 전체 예약 현황이 표시됩니다.',

  // Errors
  errRooms: '장소 목록을 불러오지 못했습니다.',
  errReservations: '예약 목록을 불러오지 못했습니다.',
  errNetwork: '네트워크 오류가 발생했습니다. 다시 시도해 주세요.',
  errGeneral: '오류가 발생했습니다.',
  errNetworkShort: '네트워크 오류',

  // Buttons
  btnRefresh: '새로고침',
  btnRetry: '다시 시도',
  btnClose: '닫기',
  btnCancel: '취소',
  btnConfirm: '확인',

  // Days (short)
  daysShort: ['일', '월', '화', '수', '목', '금', '토'],

  // Month view modal
  noReservationsOnDay: '해당 일자에는 예약이 없습니다.',

  // List view
  noUpcoming: '예정된 예약이 없습니다.',

  // Reserve form
  reservePageTitle: '장소 예약 신청',
  reservePageSubtitle: '오레곤벧엘교회 회의실 및 장소 예약',
  backLabel: '뒤로가기',

  // Form fields
  fieldTitle: '제목',
  fieldRoom: '장소',
  fieldDate: '날짜',
  fieldTime: '예약 시간',
  fieldTimeUnit: '(15분 단위)',
  fieldRecurring: '반복 설정',
  fieldRecurringUntil: '반복 종료일',
  fieldPerson: '담당자',
  fieldEmail: '이메일',
  fieldNotes: '기타 노트',
  fieldNotesOptional: '(선택)',
  fieldAccessCode: '예약 코드',
  accessCodePlaceholder: '교회에서 안내받은 코드',
  accessCodeHint: '확인을 위한 코드입니다. 담당자에게 문의해 주세요.',
  errAccessCodeRequired: '예약 코드를 입력해주세요.',
  errAccessCodeWrong: '예약 코드가 올바르지 않습니다. 담당자에게 문의해 주세요.',
  optional: '선택',

  // Form placeholders
  placeholderTitle: '예: 사랑방 모임, 사역팀 회의 등',
  placeholderRoom: '장소를 선택하세요',
  placeholderPerson: '이름 또는 연락처',
  placeholderNotes: '특이사항이나 요청사항을 입력해주세요.',

  // Date limit hint
  dateLimitHint: '현재 일자 기준으로, 한 달 이내 날짜만 예약 가능합니다.',

  // Recurring labels
  recurringNone: '반복 없음',
  recurringDaily: '매일',
  recurringWeekly: '매주',
  recurringMonthly: '매월',
  recurringHint: (start: string, end: string, label: string) => `${start} 부터 ${end} 까지 ${label} 반복`,
  recurringHintDefault: (label: string) => `시작 날짜부터 종료일까지 ${label} 반복됩니다.`,

  // Form validation errors
  errTitleRequired: '제목을 입력해주세요.',
  errTitleLength: (n: number) => `제목은 ${n}자 이하여야 합니다.`,
  errRoomRequired: '장소를 선택해주세요.',
  errDateRequired: '날짜를 선택해주세요.',
  errStartRequired: '시작 시간을 선택해주세요.',
  errEndRequired: '종료 시간을 선택해주세요.',
  errEndBeforeStart: '종료 시간은 시작 시간보다 늦어야 합니다.',
  errPersonRequired: '담당자를 입력해주세요.',
  errPersonLength: (n: number) => `담당자명은 ${n}자 이하여야 합니다.`,
  errEmailRequired: '이메일을 입력해주세요.',
  errEmailFormat: '올바른 이메일 형식이 아닙니다.',
  errEmailLength: (n: number) => `이메일은 ${n}자 이하여야 합니다.`,
  errNotesLength: (n: number) => `노트는 ${n}자 이하여야 합니다.`,
  errRecurringUntilRequired: '반복 종료일을 선택해주세요.',
  errRecurringUntilAfterStart: '반복 종료일은 시작 날짜 이후여야 합니다.',
  errConflictDefault: '선택하신 시간에 이미 해당 장소 예약이 있습니다. 다른 시간 또는 장소를 선택해주세요.',

  // Submit buttons
  btnSubmitting: '처리 중...',
  btnRecurringReserve: '반복 예약 신청',
  btnReserveAction: '예약 신청',
  btnMoreReserve: '추가 예약 신청',
  btnBackToCalendar: '캘린더로 돌아가기',

  // Conflict banner
  conflictTitle: '예약 시간 충돌',

  // Success
  reserveSuccess: '예약 완료!',
  reserveSuccessDesc: '예약이 완료되었습니다.',
  reserveSuccessEmailLine1: '등록된 메일주소',
  reserveSuccessEmailLine2: '로',
  reserveSuccessEmailLine3: '확인 메일이 발송되었습니다.',
  recurringCreated: (n: number) => `✓ ${n}회 예약 완료`,
  recurringConflicts: (n: number) => `⚠ ${n}회는 시간 충돌로 제외됨`,

  // Rules modal
  rulesTitle: '장소 사용 수칙 및 주의 사항',
  rulesIntro: '교회 내 모든 시설은 신앙 생활과 교제를 위한 공간입니다. 아래 사용 수칙을 반드시 준수해 주시기 바랍니다.',
  rulesItems: [
    { title: '1. 사용 목적 제한 (영리 활동 금지)', body: '개인적인 수입을 목적으로 하는 레슨(과외), 비즈니스 미팅, 물품 판매 등 모든 영리 활동은 엄격히 금지합니다.' },
    { title: '2. 청결 및 정리 정돈', body: '사용 후에는 다음 사용자를 위해 반드시 정리 정돈을 완료해 주십시오. 발생한 쓰레기는 지정된 장소에 분리배출 하거나 직접 수거해 가시기 바랍니다.' },
    { title: '3. 에너지 절약 및 화재 예방', body: '퇴실 시 반드시 모든 전등을 끄고, 냉난방기 및 전기 기구의 전원을 차단해 주십시오. 휴대용 버너, 양초 등 화기 사용은 절대 금지합니다.' },
    { title: '4. 시설물 관리', body: '교회 기물 및 비품을 소중히 다뤄 주시고, 파손 시 즉시 교회 사무실에 알려 주시기 바랍니다.' },
  ],
  rulesAgree: '주의사항을 모두 숙지하였으며, 이를 준수할 것에 동의합니다.',
  btnReserveFromRules: '예약 신청하기',

  // Cancel request modal
  cancelModalTitle: '예약 취소 신청',
  cancelDesc: (title: string) => `"${title}" 예약의 취소를 신청합니다.`,
  cancelScope: '취소 범위',
  cancelScopeOne: '이 일정만 취소',
  cancelScopeAll: '이 일정부터 이후 반복 일정 모두 취소',
  cancelEmailLabel: '예약 시 입력한 이메일',
  cancelEmailPlaceholder: '예약에 사용한 이메일을 입력해주세요.',
  cancelReasonLabel: '취소 사유',
  cancelReasonPlaceholder: '취소 사유를 입력해주세요.',
  btnCancelSubmit: '취소 신청',
  btnCancelSubmitting: '제출 중...',
  cancelSuccess: '취소 완료',
  cancelSuccessDesc: '예약이 취소되었습니다.',
  errEmailRequiredCancel: '이메일을 입력해주세요.',
  errReasonRequired: '취소 사유를 입력해주세요.',
  errReasonLength: (n: number) => `취소 사유는 ${n}자 이하여야 합니다.`,

  // Cancel button
  btnRequestCancel: '취소 신청하기',

  // Edit reservation modal
  editModalTitle: '예약 변경',
  editDesc: (title: string) => `"${title}" 예약의 시간·내용을 변경합니다.`,
  editFixedNote: '장소와 날짜는 변경할 수 없습니다. 바꾸시려면 예약을 취소하신 후 다시 신청해 주세요.',
  editEmailLabel: '예약 시 입력한 이메일',
  editEmailPlaceholder: '예약에 사용한 이메일을 입력해주세요.',
  btnEditSubmit: '변경 저장',
  btnEditSubmitting: '저장 중...',
  editSuccess: '변경 완료',
  editSuccessDesc: '예약이 변경되었습니다.',
  errEmailRequiredEdit: '이메일을 입력해주세요.',
  errNoChanges: '변경된 내용이 없습니다.',
  btnRequestEdit: '변경하기',
  editFixedNoteAdmin: '장소와 날짜는 변경할 수 없습니다. 같은 날짜 안에서 시간과 내용만 수정됩니다.',
  adminBtnEdit: '변경',
  toastEdited: '변경 완료',
  detailFieldPreviousTime: '변경 전 시간',
  detailFieldUpdatedAt: '변경일시',

  // Popover
  personLabel: '담당:',

  // Admin
  adminTitle: '관리자 모드',
  adminSubtitle: '오레곤벧엘교회 예약 관리',
  adminLoginTitle: '관리자 로그인',
  adminLoginSubtitle: '오레곤벧엘교회 예약관리시스템',
  adminPasswordLabel: '비밀번호',
  adminPasswordPlaceholder: '관리자 비밀번호를 입력하세요',
  adminLoginBtn: '로그인',
  adminLoginLoading: '확인 중...',
  adminLogout: '로그아웃',
  adminGoBack: '돌아가기',
  adminReserveBtn: '예약하기',
  adminTabReservations: '예약 목록',
  adminTabCancellations: '취소 목록',
  adminTabAll: '전체',
  adminNoReservations: '예약 내역이 없습니다.',
  adminNoPending: '승인 대기 중인 예약이 없습니다.',
  adminNoRoomFilter: '선택한 장소의 예약 내역이 없습니다.',
  adminDataError: '데이터를 불러오지 못했습니다.',
  adminChecking: '확인 중...',

  // Admin table headers
  colStatus: '상태',
  colTitle: '제목',
  colRoom: '장소',
  colTime: '시간',
  colPerson: '담당자',
  colCreatedAt: '신청일시',

  // Admin data labels
  seriesCount: (n: number) => `반복 예약 ${n}건`,
  seriesCountSuffix: (n: number) => `${n}건`,
  cancelReasonPrefix: '취소 사유: ',
  rejectionReasonPrefix: '거절 사유: ',
  personLabelAdmin: '담당: ',

  // Admin action buttons
  btnApprove: '승인',
  btnReject: '거절',
  btnDelete: '삭제',
  btnDetail: '상세보기',
  btnApproveSeries: '시리즈 승인',
  btnRejectSeries: '시리즈 거절',
  btnApproveCancelSeries: '시리즈 취소 승인',
  btnRejectCancelSeries: '시리즈 취소 거절',

  // Toast messages
  toastApproved: '승인 완료',
  toastSeriesApproved: (n: number) => `${n}건 시리즈 승인 완료`,
  toastBulkApproved: (n: number) => `${n}건 승인 완료`,
  toastRejected: '거절 처리되었습니다.',
  toastSeriesRejected: (n: number) => `${n}건 시리즈 거절 처리되었습니다.`,
  toastDeleted: '삭제되었습니다.',
  toastCancelApproved: '취소 승인되었습니다.',
  toastCancelRejected: '취소 거절되었습니다.',
  toastSeriesCancelApproved: (n: number) => `${n}건 시리즈 취소 승인되었습니다.`,
  toastSeriesCancelRejected: (n: number) => `${n}건 시리즈 취소 거절되었습니다.`,
  toastError: '오류',
  toastNetworkError: '네트워크 오류',

  // Reject modals
  rejectTitle: '예약 거절',
  rejectDesc: (title: string) => `"${title}" 예약을 거절합니다.`,
  rejectReasonLabel: '거절 사유',
  rejectReasonPlaceholder: '거절 사유를 입력해주세요.',
  errRejectReasonRequired: '거절 사유를 입력해주세요.',
  btnRejectConfirm: '거절 확정',

  rejectSeriesTitle: '반복 예약 전체 거절',
  rejectSeriesDesc: (title: string, room: string, count: number) => `"${title}" — ${room} · ${count}건을 모두 거절합니다.`,

  rejectCancelSeriesTitle: '시리즈 취소 신청 거절',
  rejectCancelSeriesDesc: (title: string, room: string, count: number) => `"${title}" — ${room} · ${count}건의 취소 신청을 거절합니다.`,
  rejectCancelReasonOptional: '거절 사유 (선택, 요청자 이메일에 포함)',
  rejectCancelPlaceholderOptional: '선택 사항입니다.',
  btnRejectCancelConfirm: '취소 거절',

  rejectCancelTitle: '취소 신청 거절',
  rejectCancelDesc: (title: string) => `"${title}" 예약의 취소 신청을 거절합니다.`,

  // Delete modal
  deleteTitle: '예약 삭제',
  deleteConfirmMsg: '다음 예약을 삭제하시겠습니까?',
  deleteWarning: '* 삭제된 예약은 복구할 수 없습니다.',
  btnDeleteConfirm: '삭제',

  // Detail modal
  detailTitle: '예약 상세',
  detailFieldTitle: '제목',
  detailFieldStatus: '상태',
  detailFieldRoom: '장소',
  detailFieldTime: '시간',
  detailFieldPerson: '담당자',
  detailFieldEmail: '이메일',
  detailFieldNotes: '메모',
  detailFieldRejectionReason: '거절 사유',
  detailFieldCancelReason: '취소 사유',
  detailFieldCreatedAt: '신청일',

  // Status badges
  statusPending: '승인 대기중',
  statusApproved: '예약 완료',
  statusCancelled: '취소 완료',
  statusRejected: '거절',

  // Admin note
  adminRejectedNote: '거절된 예약은 캘린더에 표시되지 않습니다.',

  // Notification recipients
  adminTabSettings: '설정',
  settingsTitle: '예약 코드',
  settingsDesc: '예약 신청 시 입력해야 하는 공유 코드입니다. 비워두면 코드 없이 누구나 신청할 수 있습니다.',
  settingsCodeLabel: '코드',
  settingsCodePlaceholder: '예: bethel2026 (비우면 사용 안 함)',
  settingsSave: '저장',
  settingsSaved: '예약 코드를 저장했습니다.',
  settingsDisabled: '현재 코드가 설정되지 않아 누구나 예약할 수 있습니다.',
  settingsEnabled: (code: string) => `현재 코드: ${code}`,
  settingsWarn: '코드는 시간이 지나면 알려지게 됩니다. 필요할 때 여기서 바꾸시면 됩니다.',
  recipientsTitle: '문자 알림 수신자',
  recipientsDesc: '예약·취소·변경 신청 시 문자를 받을 담당자 목록입니다. Twilio를 통해 발송됩니다.',
  recipientName: '이름',
  recipientPhone: '전화번호',
  recipientPhonePlaceholder: '숫자만 입력 (예: 5031234567)',
  recipientNamePlaceholder: '담당자 이름',
  recipientAdd: '추가',
  noRecipients: '등록된 수신자가 없습니다.',
  recipientAdded: '수신자가 추가되었습니다.',
  recipientDeleted: '수신자가 삭제되었습니다.',
  errRecipientName: '이름을 입력해주세요.',
  errRecipientPhone: '올바른 전화번호를 입력해주세요. (10자리 이상 숫자)',
};

const en: typeof ko = {
  siteTitle: 'Bethel Room Reservation',
  siteTitleShort: 'Bethel Rooms',

  btnReserve: '+ Reserve a Room',
  btnReserveShort: '+ Reserve',
  btnAdmin: 'Admin',
  btnAdminShort: 'Admin',

  noticeDesktop: 'This system is for small groups only. For large events such as weddings, please use the',
  noticeMobile: 'For small groups only. For large events like weddings, please use the',
  noticeLink: 'Request Form',
  noticeSuffix: '.',

  viewDay: 'Day',
  viewWeek: 'Week',
  viewMonth: 'Month',
  viewList: 'List',

  today: 'Today',
  prev: 'Previous',
  next: 'Next',

  roomFilter: 'Room Filter',
  filterCollapse: 'Collapse',
  filterExpand: 'Expand',
  filterExpandLabel: 'Expand room filter',
  filterCollapseLabel: 'Collapse room filter',
  showAll: 'Show All',
  deselect: 'Deselect',
  loading: 'Loading...',
  monthHint: 'Click on a date to see all reservations for that day.',

  errRooms: 'Failed to load room list.',
  errReservations: 'Failed to load reservations.',
  errNetwork: 'A network error occurred. Please try again.',
  errGeneral: 'An error occurred.',
  errNetworkShort: 'Network error',

  btnRefresh: 'Refresh',
  btnRetry: 'Try again',
  btnClose: 'Close',
  btnCancel: 'Cancel',
  btnConfirm: 'OK',

  daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

  noReservationsOnDay: 'No reservations on this day.',

  noUpcoming: 'No upcoming reservations.',

  reservePageTitle: 'Room Reservation Request',
  reservePageSubtitle: 'Oregon Bethel Church Room Reservation',
  backLabel: 'Back',

  fieldTitle: 'Title',
  fieldRoom: 'Room',
  fieldDate: 'Date',
  fieldTime: 'Time',
  fieldTimeUnit: '(15-min intervals)',
  fieldRecurring: 'Recurring',
  fieldRecurringUntil: 'Repeat Until',
  fieldPerson: 'Contact Person',
  fieldEmail: 'Email',
  fieldNotes: 'Notes',
  fieldNotesOptional: '(Optional)',
  fieldAccessCode: 'Reservation Code',
  accessCodePlaceholder: 'Code provided by the church',
  accessCodeHint: 'Used to confirm you are a member. Ask the church office.',
  errAccessCodeRequired: 'Please enter the reservation code.',
  errAccessCodeWrong: 'That reservation code is not correct. Please check the bulletin or contact the church office.',
  optional: 'Optional',

  placeholderTitle: 'e.g. Home Group, Ministry Team Meeting',
  placeholderRoom: 'Select a room',
  placeholderPerson: 'Name or contact',
  placeholderNotes: 'Enter any special requests or notes.',

  dateLimitHint: 'Reservations are limited to within one month from today.',

  recurringNone: 'No repeat',
  recurringDaily: 'Daily',
  recurringWeekly: 'Weekly',
  recurringMonthly: 'Monthly',
  recurringHint: (start: string, end: string, label: string) => `Repeats ${label} from ${start} to ${end}`,
  recurringHintDefault: (label: string) => `Repeats ${label} from start date to end date.`,

  errTitleRequired: 'Please enter a title.',
  errTitleLength: (n: number) => `Title must be ${n} characters or fewer.`,
  errRoomRequired: 'Please select a room.',
  errDateRequired: 'Please select a date.',
  errStartRequired: 'Please select a start time.',
  errEndRequired: 'Please select an end time.',
  errEndBeforeStart: 'End time must be after start time.',
  errPersonRequired: 'Please enter a contact person.',
  errPersonLength: (n: number) => `Contact name must be ${n} characters or fewer.`,
  errEmailRequired: 'Please enter an email address.',
  errEmailFormat: 'Please enter a valid email address.',
  errEmailLength: (n: number) => `Email must be ${n} characters or fewer.`,
  errNotesLength: (n: number) => `Notes must be ${n} characters or fewer.`,
  errRecurringUntilRequired: 'Please select a repeat end date.',
  errRecurringUntilAfterStart: 'Repeat end date must be after the start date.',
  errConflictDefault: 'This room is already booked for the selected time. Please choose a different time or room.',

  btnSubmitting: 'Submitting...',
  btnRecurringReserve: 'Submit Recurring Reservation',
  btnReserveAction: 'Submit Reservation',
  btnMoreReserve: 'Make Another Reservation',
  btnBackToCalendar: 'Back to Calendar',

  conflictTitle: 'Time Conflict',

  reserveSuccess: 'Reservation Complete!',
  reserveSuccessDesc: 'Your reservation has been confirmed.',
  reserveSuccessEmailLine1: 'A confirmation email has been sent to',
  reserveSuccessEmailLine2: '',
  reserveSuccessEmailLine3: '.',
  recurringCreated: (n: number) => `✓ ${n} reservation(s) confirmed`,
  recurringConflicts: (n: number) => `⚠ ${n} skipped due to time conflicts`,

  rulesTitle: 'Facility Usage Guidelines',
  rulesIntro: 'All facilities in the church are spaces for faith and fellowship. Please follow the guidelines below.',
  rulesItems: [
    { title: '1. Purpose Restrictions (No Commercial Activities)', body: 'All commercial activities, including private lessons (tutoring), business meetings, and product sales for personal income, are strictly prohibited.' },
    { title: '2. Cleanliness and Tidiness', body: 'After use, please clean up and tidy the space for the next user. Dispose of all trash at designated locations or take it with you.' },
    { title: '3. Energy Conservation and Fire Safety', body: 'When leaving, please turn off all lights and shut off HVAC and electrical appliances. Use of portable burners, candles, or open flame is strictly prohibited.' },
    { title: '4. Facility Care', body: 'Please handle all church equipment and furnishings with care. Report any damage to the church office immediately.' },
  ],
  rulesAgree: 'I have read and understood all guidelines and agree to comply.',
  btnReserveFromRules: 'Proceed to Reservation',

  cancelModalTitle: 'Request Cancellation',
  cancelDesc: (title: string) => `You are requesting cancellation of "${title}".`,
  cancelScope: 'Cancellation Scope',
  cancelScopeOne: 'Cancel this event only',
  cancelScopeAll: 'Cancel this and all future recurring events',
  cancelEmailLabel: 'Email used for reservation',
  cancelEmailPlaceholder: 'Enter the email used when making the reservation.',
  cancelReasonLabel: 'Reason for cancellation',
  cancelReasonPlaceholder: 'Enter your reason for cancellation.',
  btnCancelSubmit: 'Request Cancellation',
  btnCancelSubmitting: 'Submitting...',
  cancelSuccess: 'Cancellation Complete',
  cancelSuccessDesc: 'Your reservation has been cancelled.',
  errEmailRequiredCancel: 'Please enter your email address.',
  errReasonRequired: 'Please enter a reason for cancellation.',
  errReasonLength: (n: number) => `Reason must be ${n} characters or fewer.`,

  btnRequestCancel: 'Request Cancellation',

  // Edit reservation modal
  editModalTitle: 'Edit Reservation',
  editDesc: (title: string) => `Editing the time and details of "${title}".`,
  editFixedNote: 'Room and date cannot be changed here. To change either, cancel the reservation and book again.',
  editEmailLabel: 'Email used for reservation',
  editEmailPlaceholder: 'Enter the email used when making the reservation.',
  btnEditSubmit: 'Save Changes',
  btnEditSubmitting: 'Saving...',
  editSuccess: 'Changes Saved',
  editSuccessDesc: 'Your reservation has been updated.',
  errEmailRequiredEdit: 'Please enter your email address.',
  errNoChanges: 'Nothing has been changed.',
  btnRequestEdit: 'Edit',
  editFixedNoteAdmin: 'Room and date cannot be changed. Only the time and details within the same date are updated.',
  adminBtnEdit: 'Edit',
  toastEdited: 'Changes saved.',
  detailFieldPreviousTime: 'Previous Time',
  detailFieldUpdatedAt: 'Last Edited',

  personLabel: 'Contact:',

  adminTitle: 'Admin',
  adminSubtitle: 'Oregon Bethel Church Reservations',
  adminLoginTitle: 'Admin Login',
  adminLoginSubtitle: 'Oregon Bethel Church Reservation System',
  adminPasswordLabel: 'Password',
  adminPasswordPlaceholder: 'Enter admin password',
  adminLoginBtn: 'Login',
  adminLoginLoading: 'Verifying...',
  adminLogout: 'Logout',
  adminGoBack: 'Go Back',
  adminReserveBtn: 'New Reservation',
  adminTabReservations: 'Reservations',
  adminTabCancellations: 'Cancellations',
  adminTabAll: 'All',
  adminNoReservations: 'No reservations found.',
  adminNoPending: 'No pending reservations.',
  adminNoRoomFilter: 'No reservations for the selected room.',
  adminDataError: 'Failed to load data.',
  adminChecking: 'Verifying...',

  colStatus: 'Status',
  colTitle: 'Title',
  colRoom: 'Room',
  colTime: 'Time',
  colPerson: 'Contact',
  colCreatedAt: 'Submitted',

  seriesCount: (n: number) => `Recurring (${n})`,
  seriesCountSuffix: (n: number) => `${n} event(s)`,
  cancelReasonPrefix: 'Reason: ',
  rejectionReasonPrefix: 'Rejection: ',
  personLabelAdmin: 'Contact: ',

  btnApprove: 'Approve',
  btnReject: 'Reject',
  btnDelete: 'Delete',
  btnDetail: 'Details',
  btnApproveSeries: 'Approve Series',
  btnRejectSeries: 'Reject Series',
  btnApproveCancelSeries: 'Approve Cancel (Series)',
  btnRejectCancelSeries: 'Reject Cancel (Series)',

  toastApproved: 'Approved',
  toastSeriesApproved: (n: number) => `${n} in series approved`,
  toastBulkApproved: (n: number) => `${n} approved`,
  toastRejected: 'Rejected.',
  toastSeriesRejected: (n: number) => `${n} in series rejected.`,
  toastDeleted: 'Deleted.',
  toastCancelApproved: 'Cancellation approved.',
  toastCancelRejected: 'Cancellation rejected.',
  toastSeriesCancelApproved: (n: number) => `${n} cancellations in series approved.`,
  toastSeriesCancelRejected: (n: number) => `${n} cancellations in series rejected.`,
  toastError: 'Error',
  toastNetworkError: 'Network error',

  rejectTitle: 'Reject Reservation',
  rejectDesc: (title: string) => `You are rejecting the reservation "${title}".`,
  rejectReasonLabel: 'Reason for rejection',
  rejectReasonPlaceholder: 'Enter your reason for rejection.',
  errRejectReasonRequired: 'Please enter a reason for rejection.',
  btnRejectConfirm: 'Confirm Rejection',

  rejectSeriesTitle: 'Reject Entire Recurring Series',
  rejectSeriesDesc: (title: string, room: string, count: number) => `Rejecting all ${count} events for "${title}" — ${room}.`,

  rejectCancelSeriesTitle: 'Reject Series Cancellation Request',
  rejectCancelSeriesDesc: (title: string, room: string, count: number) => `Rejecting cancellation request for ${count} events in "${title}" — ${room}.`,
  rejectCancelReasonOptional: 'Reason (optional, sent to requester)',
  rejectCancelPlaceholderOptional: 'Optional.',
  btnRejectCancelConfirm: 'Reject Cancellation',

  rejectCancelTitle: 'Reject Cancellation Request',
  rejectCancelDesc: (title: string) => `Rejecting the cancellation request for "${title}".`,

  deleteTitle: 'Delete Reservation',
  deleteConfirmMsg: 'Are you sure you want to delete this reservation?',
  deleteWarning: '* This action cannot be undone.',
  btnDeleteConfirm: 'Delete',

  detailTitle: 'Reservation Details',
  detailFieldTitle: 'Title',
  detailFieldStatus: 'Status',
  detailFieldRoom: 'Room',
  detailFieldTime: 'Time',
  detailFieldPerson: 'Contact',
  detailFieldEmail: 'Email',
  detailFieldNotes: 'Notes',
  detailFieldRejectionReason: 'Rejection Reason',
  detailFieldCancelReason: 'Cancellation Reason',
  detailFieldCreatedAt: 'Submitted',

  statusPending: 'Pending',
  statusApproved: 'Confirmed',
  statusCancelled: 'Cancelled',
  statusRejected: 'Rejected',

  adminRejectedNote: 'Rejected reservations are not shown on the calendar.',

  adminTabSettings: 'Settings',
  settingsTitle: 'Reservation Code',
  settingsDesc: 'The shared code people must enter to submit a reservation. Leave it empty to let anyone reserve without a code.',
  settingsCodeLabel: 'Code',
  settingsCodePlaceholder: 'e.g. bethel2026 (empty = off)',
  settingsSave: 'Save',
  settingsSaved: 'Reservation code saved.',
  settingsDisabled: 'No code is set, so anyone can reserve.',
  settingsEnabled: (code: string) => `Current code: ${code}`,
  settingsWarn: 'Shared codes get around over time. Change it here whenever you need to.',
  recipientsTitle: 'SMS Alert Recipients',
  recipientsDesc: 'People who receive a text when a reservation, cancellation or change is submitted. Sent via Twilio.',
  recipientName: 'Name',
  recipientPhone: 'Phone number',
  recipientPhonePlaceholder: 'Digits only (e.g. 5031234567)',
  recipientNamePlaceholder: 'Contact name',
  recipientAdd: 'Add',
  noRecipients: 'No recipients added yet.',
  recipientAdded: 'Recipient added.',
  recipientDeleted: 'Recipient removed.',
  errRecipientName: 'Please enter a name.',
  errRecipientPhone: 'Please enter a valid phone number (10+ digits).',
};

export const translations = { ko, en } as const;
export type T = typeof ko;
