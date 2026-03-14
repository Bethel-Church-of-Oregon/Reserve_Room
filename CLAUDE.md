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

## 주요 파일
- `src/lib/db.ts` — Postgres 스키마, 쿼리, TypeScript 타입
- `src/lib/email.ts` — 이메일 발송 (승인/거절 알림), nodemailer 사용
- `src/app/page.tsx` — 메인 캘린더 (day/week/month, 클라이언트 컴포넌트)
- `src/components/DayView.tsx` — 일간 캘린더 (오전 6시~오후 11시, 1.5px/분)
- `src/app/reserve/page.tsx` — 예약 신청 폼 (Suspense로 useSearchParams 감쌈)
- `src/app/admin/page.tsx` — 관리자 패널 (로그인 → 승인/거절/삭제)
- `src/components/WeekView.tsx` — 주간 캘린더 (오전 6시~오후 11시, 1.5px/분)
- `src/components/MonthView.tsx` — 월간 캘린더
- `src/app/api/reservations/route.ts` — GET, POST (단건 + 반복 예약)
- `src/app/api/reservations/[id]/route.ts` — PATCH (승인/거절 + 이메일 발송), DELETE
- `src/app/api/admin/auth/route.ts` — GET/POST/DELETE 관리자 세션 쿠키
- `src/app/api/admin/reservations/route.ts` — GET 전체 목록, POST 일괄 승인 (관리자 전용)
- `src/app/api/rooms/route.ts` — GET 회의실 목록

## DB 스키마
- `rooms`: id, name, color — 비전홀 + 은혜성전 20개 시드 데이터
- `reservations`: id, title, room_id, start_time, end_time, person_in_charge, **email**, notes, status(pending/approved/rejected), rejection_reason, created_at
- Postgres: Vercel Marketplace에서 Neon 연동 시 `POSTGRES_URL` 또는 `DATABASE_URL` 자동 주입
- 시드는 rooms 테이블이 비어있을 때만 실행 (`count === 0` 체크)
- 장소 변경 시 Neon 콘솔에서 `DELETE FROM reservations; DELETE FROM rooms;` 후 앱 재시작

## 장소 목록 (20개)
비전홀: 대예배실, 새가족실, 영아부실, 유아부실, 유치부실, 찬양대실, 2층 교실 1~4, 2층 올리브홀(초등부), 2층 초등부 교사실
은혜성전: 친교실, 교실 1~5, 청년부실, (구)교역자실

## 환경변수 (.env.local)
```env
POSTGRES_URL=                     # Neon 연결 문자열 (Vercel 연동 시 자동, DATABASE_URL도 가능)
ADMIN_PASSWORD=bethel2024         # 관리자 비밀번호
GMAIL_USER=                       # Gmail 주소 (선택, 미설정 시 bethel.oregon.dev@gmail.com)
GMAIL_APP_PASSWORD=               # Gmail 앱 비밀번호 16자리 (공백 없이)
UPSTASH_REDIS_REST_URL=           # Upstash Redis URL (선택, rate limiting용)
UPSTASH_REDIS_REST_TOKEN=         # Upstash Redis Token (선택, rate limiting용)
```
- Gmail 앱 비밀번호: Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호
- `GMAIL_APP_PASSWORD` 미설정 시 이메일 건너뜀, 예약 기능은 정상 동작
- `UPSTASH_*` 미설정 시 rate limiting 비활성화 (관리자 로그인/예약/취소 제한 없음)

## 관리자 인증
- 쿠키 기반: `admin_auth=true` (httpOnly, 8시간)
- 비밀번호: `.env.local`의 `ADMIN_PASSWORD`

## 핵심 설계 결정
- 승인 대기 예약: CSS 빗금 패턴 (`.reservation-pending`)
- 확정 예약: 회색 계열 표시
- 회의실별 색상 20가지 시드 데이터로 정의
- 일간/주간 뷰: 오전 6시~오후 11시, 1.5px/분, 겹침 감지 컬럼 레이아웃
- 충돌 감지: 같은 회의실 + 같은 시간대 이중 예약 방지
  - `checkConflict()` 함수: `status != 'rejected'`인 기존 예약과 시간 겹침 확인
  - 충돌 메시지는 예약신청/취소 버튼 바로 위에 표시
- 반복 예약: daily/weekly/monthly, 최대 200회, 충돌 날짜 자동 제외하고 나머지만 생성
- 일괄 승인: `POST /api/admin/reservations` 단일 호출 → `sendBulkApprovalEmail` (이메일 주소별 묶음 발송)
- Vercel Postgres: 서버리스 환경에서 영구 저장, `data/` 디렉토리 불필요
- SendGrid/Resend 미사용 — nodemailer + Gmail SMTP만 사용

## UI 구성
- 상단: 일간/주간/월간/오늘 토글 + 확정/승인대기 범례
- 모바일(< 640px): 기본 뷰 일간, 헤더 버튼 축약 표시 (hydration 방지: SSR은 주간, useEffect에서 전환)
- 우측 상단: 장소 예약 신청, 관리자 모드 버튼
- 공지 배너: 큰 행사는 사용신청서(Google Drive 링크) 제출 안내
- **장소 필터**: "장소 필터 ▾" 버튼 클릭 시 패널 펼침, 장소 chip 클릭으로 멀티 필터링, "전체 보기"로 초기화
- 예약 신청 폼: 타이틀, 장소(드롭다운), 날짜, 시작/종료 시간(15분 단위), 반복설정, 담당자, 이메일, 노트(선택)
- 관리자: 승인 대기 리스트 → 체크박스 선택 → 일괄 승인/거절(사유 입력) / 확정 예약 삭제
