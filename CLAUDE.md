# Bethel Reserve Room — CLAUDE.md

교회 회의실 예약 웹 앱. Next.js 14 App Router + Vercel Postgres (Neon).

## 실행
```bash
npm run dev      # 개발 (포트 8000, 빌드 불필요)
npm run build && npm start  # 프로덕션 (포트 8000)
```

## Tech Stack
- **Framework**: Next.js 14.2.3 (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Database**: Neon Postgres via `@neondatabase/serverless`
- **Email**: Nodemailer + Gmail SMTP (앱 비밀번호)
- **Rate Limiting**: Upstash Redis (선택)

## 주요 파일
- `src/lib/db.ts` — Postgres 스키마, 쿼리, TypeScript 타입
- `src/lib/email.ts` — 이메일 발송 (승인/거절/취소 알림), nodemailer 사용
- `src/lib/auth.ts` — HMAC-SHA256 관리자 세션 토큰 생성/검증
- `src/lib/constants.ts` — 입력값 길이 제한 상수 (`LIMITS`)
- `src/lib/ratelimit.ts` — Upstash Redis 기반 rate limiting (로그인/예약/취소)
- `src/app/page.tsx` — 메인 캘린더 (day/week/month/list, 클라이언트 컴포넌트)
- `src/components/DayView.tsx` — 일간 캘린더 (오전 6시~오후 11시, 1.5px/분) + 현재 시간 라인 (Pacific time)
- `src/components/WeekView.tsx` — 주간 캘린더 (오전 6시~오후 11시, 1.5px/분)
- `src/components/MonthView.tsx` — 월간 캘린더, 날짜 셀 클릭 시 해당 날 예약 모달
- `src/components/ListView.tsx` — 목록 뷰 (오늘 이후 전체 예약, 주 단위 헤더, 날짜별 카드)
- `src/components/ReservationDetailPopover.tsx` — 예약 상세 팝오버 + `CancelRequestModal` (취소 신청)
- `src/app/reserve/page.tsx` — 예약 신청 폼 (Suspense로 useSearchParams 감쌈)
- `src/app/admin/page.tsx` — 관리자 패널 (로그인 → 승인/거절/취소처리/삭제)
- `src/app/api/reservations/route.ts` — GET, POST (단건 + 반복 예약)
- `src/app/api/reservations/[id]/route.ts` — PATCH (승인/거절/취소승인/취소거절 + 이메일), DELETE
- `src/app/api/reservations/[id]/cancel/route.ts` — POST 취소 신청 (단건 또는 시리즈 이후 전체)
- `src/app/api/admin/auth/route.ts` — GET/POST/DELETE 관리자 세션 쿠키
- `src/app/api/admin/reservations/route.ts` — GET 전체 목록, POST 일괄 승인 (관리자 전용)
- `src/app/api/admin/series/[id]/route.ts` — PATCH 시리즈 승인/거절/취소승인/취소거절
- `src/app/api/rooms/route.ts` — GET 회의실 목록

## DB 스키마
- `rooms`: id, name, color — 비전홀 + 은혜성전 20개 시드 데이터
- `reservation_series`: id(TEXT/UUID), title, room_id, person_in_charge, email, notes, recurring, recurring_until, status(pending/approved/rejected/cancelled), rejection_reason, created_at
- `reservations`: id, series_id(→reservation_series), series_index, title, room_id, start_time, end_time, person_in_charge, email, notes, status(pending/approved/rejected/cancellation_requested), rejection_reason, cancellation_reason, cancellation_requested_at, previous_status, created_at
- Postgres: Vercel Marketplace에서 Neon 연동 시 `POSTGRES_URL` 또는 `DATABASE_URL` 자동 주입
- 시드는 rooms 테이블이 비어있을 때만 실행 (`count === 0` 체크)
- 장소 변경 시 Neon 콘솔에서 `DELETE FROM reservations; DELETE FROM rooms;` 후 앱 재시작
- 스키마 마이그레이션: `ensureDbReady()`에서 `ADD COLUMN IF NOT EXISTS`로 idempotent 처리

## 장소 목록 (20개)
비전홀: 대예배실, 새가족실, 영아부실, 유아부실, 유치부실, 찬양대실, 2층 교실 1~4, 2층 올리브홀(초등부), 2층 초등부 교사실
은혜성전: 친교실, 교실 1~5, 청년부실, (구)교역자실

## 환경변수 (.env.local)
```env
POSTGRES_URL=                     # Neon 연결 문자열 (Vercel 연동 시 자동, DATABASE_URL도 가능)
ADMIN_PASSWORD=bethel2024         # 관리자 비밀번호 (HMAC 서명 키로도 사용)
GMAIL_USER=                       # Gmail 주소 (선택, 미설정 시 bethel.oregon.dev@gmail.com)
GMAIL_APP_PASSWORD=               # Gmail 앱 비밀번호 16자리 (공백 없이)
UPSTASH_REDIS_REST_URL=           # Upstash Redis URL (선택, rate limiting용)
UPSTASH_REDIS_REST_TOKEN=         # Upstash Redis Token (선택, rate limiting용)
```
- Gmail 앱 비밀번호: Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호
- `GMAIL_APP_PASSWORD` 미설정 시 이메일 건너뜀, 예약 기능은 정상 동작
- `UPSTASH_*` 미설정 시 rate limiting 비활성화 (관리자 로그인/예약/취소 제한 없음)

## 관리자 인증
- 쿠키 기반: `admin_auth` 쿠키 (httpOnly, 8시간)
- 값: `randomToken.hmac_sha256_signature` 형식 (HMAC-SHA256, `ADMIN_PASSWORD` 키)
- `src/lib/auth.ts`의 `createAdminSession()` / `verifyAdminSession()` 사용

## 예약 상태 흐름
```
pending → approved → (cancellation_requested) → [삭제됨]
       └→ rejected
cancellation_requested → [approveCancellation: 삭제]
                       └→ [rejectCancellation: 이전 status 복원]
```
- `checkConflict()`: `status IN ('pending', 'approved', 'cancellation_requested')` 인 예약과 겹침 확인

## 취소 신청 플로우
- 캘린더에서 예약 블록 클릭 → `ReservationDetailPopover` → "취소 신청하기" 버튼 (오늘 이후 예약에만 표시)
- `CancelRequestModal`: 단건(`scope=one`) 또는 시리즈 이후 전체(`scope=series`) 선택 + 사유 입력
- 제출 성공 시 모달을 바로 닫지 않고 완료 안내 화면 표시 ("취소 신청 완료 / 관리자 승인 후 취소가 완료될 예정입니다.") → "확인" 클릭 시 닫힘
- `POST /api/reservations/[id]/cancel` → `requestCancellation()` or `requestCancellationSeries()`
- 관리자 패널 "취소 신청" 탭에서 `approve_cancellation` / `reject_cancellation` 처리
- 시리즈 취소는 `PATCH /api/admin/series/[id]`로 일괄 처리

## 핵심 설계 결정
- 승인 대기 예약: CSS 빗금 패턴 (`.reservation-pending`), 배지 표시 "승인 대기중" (`bg-yellow-100 text-yellow-700`)
- 확정 예약: 솔리드 표시, 배지 표시 "예약 확정" (`bg-green-100 text-green-700`)
- 취소 신청 중 예약: 별도 배지 표시, 배지 표시 "취소 대기중" (`bg-amber-100 text-amber-800`)
- 회의실별 색상 20가지 시드 데이터로 정의
- 일간/주간 뷰: 오전 6시~오후 11시, 1.5px/분, 겹침 감지 컬럼 레이아웃
- 충돌 감지: 같은 회의실 + 같은 시간대 이중 예약 방지
  - `checkConflict()`: `status IN ('pending', 'approved', 'cancellation_requested')`인 예약과 시간 겹침 확인
  - 충돌 메시지는 예약신청/취소 버튼 바로 위에 표시
- 반복 예약: daily/weekly/monthly, 최대 500회 (매주 약 9.6년), 충돌 날짜 자동 제외하고 나머지만 bulk INSERT
  - 생성 시 DB 쿼리 2번으로 고정 (범위 내 충돌 SELECT 1번 + 비충돌 건 UNNEST bulk INSERT 1번)
  - 이전 N+1 방식(최대 1000번 쿼리) 대비 Vercel 타임아웃 위험 제거
- 일괄 승인: `POST /api/admin/reservations` 단일 호출 → `sendBulkApprovalEmail` (이메일 주소별 묶음 발송)
- 시리즈 전체 액션: `PATCH /api/admin/series/[id]` — approve/reject/approve_cancellation/reject_cancellation
- Rate limiting: admin-login 5회/분, reservation 10회/분, cancel 10회/분 (Upstash 미설정 시 무제한)
- Vercel Postgres: 서버리스 환경에서 영구 저장, `data/` 디렉토리 불필요
- SendGrid/Resend 미사용 — nodemailer + Gmail SMTP만 사용

## UI 구성
- 레이아웃: 최대 너비 1280px (`max-w-screen-xl mx-auto`), 초과 시 양쪽 공백 + `border-x border-gray-200` 구분선
- 전체 앱 컨테이너: `h-screen overflow-hidden` — 뷰포트 높이 고정, 스크롤은 각 뷰 내부에서 처리
- `<header>` 안에 로고·버튼·공지 배너·캘린더 컨트롤·장소 필터 모두 포함 (sticky top-0)
- 컨트롤 바: 1줄 — 일간/주간/월간 토글 (왼쪽) + ‹ 오늘 › (오른쪽), 2줄 — 날짜/주/월 제목 (가운데, 일간 뷰에서는 숨김)
- 기본 뷰: 모든 기기에서 월간.
- **목록 뷰**: 일간/주간/월간 옆 "목록" 버튼으로 전환. 오늘 이후 전체 예약을 주 단위 헤더 + 날짜별 카드로 표시. 네비게이션(‹ 오늘 ›) 숨김. fetch 범위: 오늘~1년 후. 각 카드: 제목·상태 배지 / 시간 / 장소 (3줄 구성, 좌측 5px 방 색상 border-l). 카드 클릭 시 선택(배경 진해짐) + 취소 신청하기 버튼 표시 (장소와 같은 줄 오른쪽)
- 우측 상단: 장소 예약 신청, 관리자 모드 버튼
- 공지 배너: 큰 행사는 사용신청서(Google Drive 링크) 제출 안내
- **장소 필터**: "장소 필터 ▾" 버튼 클릭 시 패널 펼침, 장소 chip 클릭으로 멀티 필터링, "전체 보기"로 초기화. 같은 줄 오른쪽에 확정/승인대기 범례 + 불러오는 중 표시
- **예약 상세 팝오버**: 일간/주간 캘린더 뷰에서 예약 블록 hover → 제목·장소·시간·담당자·노트·상태 표시 + 취소 신청 버튼
- **일간 뷰 날짜 레이블**: 주간 스트립 아래 선택된 날짜를 가운데 정렬로 표시
- **현재 시간 라인**: 일간 뷰에서 오늘 날짜일 때만 파란 가로선 표시. `Intl.DateTimeFormat` + `America/Los_Angeles` 타임존으로 DST 자동 처리. 30초마다 갱신
- **일간 뷰 고정 헤더**: 주간 스트립 + 날짜 레이블을 단일 `sticky top-0` 래퍼로 묶어 스크롤 시 항상 표시
- **월간 날짜 셀 클릭**: 셀 전체가 클릭 가능, 클릭 시 해당 날의 모든 예약을 시간순으로 보여주는 모달 표시 (예약 0개이면 안내 메시지, `max-h-[88vh]`). 개별 예약 블록 hover 팝오버 없음
- **월간 뷰**: 요일 헤더(일월화수목금토)는 고정, 날짜 그리드만 `overflow-y-auto` 스크롤
- **월간 뷰 예약 블록**: 셀당 최대 표시 개수는 orientation에 따라 동적 결정 (portrait: 4개, landscape: 3개, `resize` 이벤트로 갱신), 초과 시 `+N개` 표시. 모바일(`< sm`)에서는 텍스트 숨김, 색상 바만 표시
- 예약 신청 폼: 타이틀, 장소(드롭다운), 날짜, 시작/종료 시간(15분 단위), 반복설정, 담당자, 이메일, 노트(선택)
  - 모든 input/select/textarea: `text-base`(16px) — iOS Safari 자동 확대 방지 (예약 폼 + 관리자 페이지 모두 적용)
- 관리자: 탭별 목록 (승인 대기 / 취소 신청 / 확정 / 전체) → 체크박스 선택 → 일괄 승인·거절·취소처리 / 시리즈 단위 일괄 액션 / 확정 예약 삭제
- 관리자 반응형: 925px 기준 테이블 ↔ 카드 레이아웃 전환 (커스텀 Tailwind breakpoint `admin: 925px`)
- 관리자 모바일 헤더: 대기/취소 건수 배지 없음 (탭에 이미 숫자 배지 표시됨)
- 제목 말줄임: 모든 뷰(일간 캘린더 블록, 주간, 월간, 목록 보기, 팝오버, 관리자 테이블/카드)에서 긴 제목은 `truncate`로 처리
