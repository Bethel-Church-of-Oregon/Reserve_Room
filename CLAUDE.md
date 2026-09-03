# Bethel Reserve Room — CLAUDE.md

교회 회의실 예약 웹 앱. Next.js 14 App Router + Vercel Postgres (Neon).

## 실행
```bash
npm run dev      # 개발 (포트 8000, 빌드 불필요)
npm run build && npm start  # 프로덕션 (포트 8000)
```

## 백업
```bash
npm run backup                          # backups/<타임스탬프>/ 로 내보내기
npm run restore -- backups/<폴더>        # 미리보기 (쓰지 않음)
npm run restore -- backups/<폴더> --yes  # 실제 복원
npm run restore -- ~/받은파일/backup-2026-09-01.json --yes   # 메일 첨부에서 바로
```
- **월 1회 자동 백업: `GET /api/cron/backup`** (`vercel.json` 크론, 매월 1일 10:00 UTC — Hobby 는 ±59분 오차)
  - Vercel 함수에는 영구 저장소가 없어서 **Gmail 첨부로 내보냄.** 이미 연결된 유일한 채널이고, 받은편지함은 Vercel·Neon 이 통째로 사라져도 남는 오프사이트 사본
  - **`CRON_SECRET` 필수.** Vercel 이 `Authorization: Bearer` 로 보내며, 미설정 시 라우트가 **503 으로 스스로 비활성화** — 안 그러면 누구나 호출해 전 교인 이메일이 담긴 메일을 유발할 수 있음
  - 첨부 2개: `backup-<날짜>.json`(복원용, 약 580 KB) + `reservations-<날짜>.csv`(엑셀용). 총 0.8 MB로 Gmail 25 MB 한도의 3%
  - **예약이 0행이면 메일을 보내지 않고 500.** 빈 백업은 보호받는 착각만 주므로 조용히 성공시키지 않음
  - 크론은 **프로덕션 배포에만** 적용됨. `vercel.json` 을 배포해야 활성화
- **Neon Free 는 시점 복구가 6시간뿐**이고 수동 스냅샷 1개가 전부. 월 1회 + 파괴적 작업 직전에 실행할 것
- 출력: 테이블별 JSON + `reservations.csv`(엑셀용) + `restore.sql`(psql·Neon 콘솔용) + `manifest.json`(행 수·schema_version)
- **GitHub Actions 는 쓰면 안 됨** — 저장소가 공개라 워크플로 아티팩트를 누구나 내려받을 수 있음. 예약자 이메일 유출
- **`backups/` 는 gitignore 대상.** 예약자 이메일이 들어 있고, 그 이메일이 취소·변경의 자격증명이라 절대 커밋하면 안 됨
- 복원은 **JSON 을 파라미터 바인딩으로 INSERT** — SQL 텍스트 파싱이나 `psql` 설치에 의존하지 않음. `restore.sql` 은 psql 쓰는 사람을 위한 부산물
- 전부 `ON CONFLICT DO NOTHING` → **없는 행만 추가, 기존 행은 절대 덮어쓰지 않음.** 부분 유실 복구에 안전
- 백업 로직은 `src/lib/backup.mjs` 단일 출처 — CLI 와 크론 라우트가 같은 모듈을 씀 (plain ESM 이라 bare Node 로도 import 가능, TS 러너 의존성 불필요)
- 스키마는 복사해 두지 않음. `ensureDbReady()` 가 단일 출처이므로 **빈 DB 에는 앱을 한 번 띄워 스키마를 만든 뒤** 복원
- id 를 보존하므로 복원 후 **시퀀스를 최대 id 로 setval** (안 하면 앱의 다음 INSERT 가 충돌)
- 예약이 0행이면 **exit 1 로 실패** — 조용히 빈 백업을 남기면 보호받는 줄 알고 방치하게 됨
- 실측: 합성 3건 → 백업 → 삭제 → 복원에서 전 컬럼 일치, 따옴표·줄바꿈 보존, 시퀀스 정상

## Tech Stack
- **Framework**: Next.js 14.2.3 (App Router), TypeScript — `viewport` export는 `metadata`와 분리 (`src/app/layout.tsx`)
- **Styling**: Tailwind CSS
- **Database**: Neon Postgres via `@neondatabase/serverless`
- **Email**: Nodemailer + Gmail SMTP (앱 비밀번호)
- **SMS**: Twilio (`twilio` SDK) — 통신사 이메일-투-SMS 게이트웨이에서 전환
- **Telegram**: Bot API (`fetch`) — 담당자 그룹 알림. SMS가 A2P 10DLC 승인 대기 중이어도 즉시 동작
- **Rate Limiting**: Upstash Redis (선택)

## 주요 파일
- `src/lib/db.ts` — Postgres 스키마, 쿼리, TypeScript 타입
- `src/lib/email.ts` — 이메일 발송 (예약 확인/취소 알림), nodemailer 사용
  - transporter는 **인스턴스당 1회 생성(메모이즈), 풀링은 일부러 안 함.** Vercel이 응답 직후 인스턴스를 얼려서 유지된 SMTP 소켓은 다음 호출 때 대개 죽어 있고, 죽은 소켓을 기다리는 발송은 **await 중인 요청을 정지시킴**
  - `connectionTimeout`/`greetingTimeout` 10초, `socketTimeout` 20초 — 발송을 응답 전에 await 하므로 타임아웃이 없으면 Gmail 무응답 시 Vercel의 300초 상한까지 요청이 잡힘 (실측: 옵션 없으면 30초 넘게 대기, 있으면 10초에 실패)
- `src/lib/sms.ts` — Twilio 문자 발송 (`sendSmsNotifications`) + 메시지 생성 (`build*SmsMessage`) + `toE164()`
- `src/lib/telegram.ts` — 텔레그램 발송 (`sendTelegramNotification`) + 메시지 생성 (`build*TelegramMessage`)
- `src/lib/auth.ts` — HMAC-SHA256 관리자 세션 토큰 생성/검증(12시간 만료) + 타이밍 안전 비밀번호 비교
- `src/lib/constants.ts` — 입력값 길이 제한 상수 (`LIMITS`)
- `src/lib/ratelimit.ts` — Upstash Redis 기반 rate limiting. **IP 계층(느슨한 상한) + 이메일 계층(엄격)** 2단
- `src/lib/date.ts` — **모든 날짜/시각 판단의 단일 창구.** 서부시간(`America/Los_Angeles`) 기준 `pacificDateKey()` / `pacificTodayDate()` / `pacificNow()` / `toDateKey()` + 입력 검증·정규화 `normalizeDateTime()`
- `src/lib/editReservation.ts` — `applyReservationEdit()`: 예약 변경 검증·저장·알림 (공개 라우트와 관리자 라우트가 공유)
- `src/app/page.tsx` — 메인 캘린더 (day/week/month/list, 클라이언트 컴포넌트)
- `src/components/DayView.tsx` — 일간 캘린더 (오전 6시~오후 11시, 1.5px/분) + 현재 시간 라인 (Pacific time)
- `src/components/WeekView.tsx` — 주간 캘린더 (오전 6시~오후 11시, 1.5px/분)
- `src/components/MonthView.tsx` — 월간 캘린더, 날짜 셀 클릭 시 해당 날 예약 모달
- `src/components/ListView.tsx` — 목록 뷰 (오늘 이후 전체 예약, 주 단위 헤더, 날짜별 카드)
- `src/components/ReservationDetailPopover.tsx` — 예약 상세 팝오버 + `CancelRequestModal` (취소 신청)
- `src/app/reserve/page.tsx` — 예약 신청 폼 (Suspense로 useSearchParams 감쌈)
- `src/app/admin/page.tsx` — 관리자 패널 (로그인 → 예약 목록/취소 목록/전체 조회, 삭제)
- `src/app/api/reservations/route.ts` — GET(최대 400일 범위), POST (단건 + 반복 예약, 즉시 approved 처리)
- `src/app/api/reservations/[id]/route.ts` — PATCH (관리자 전용: `edit` 등), DELETE
- `src/app/api/reservations/[id]/cancel/route.ts` — POST 취소 (단건만, 즉시 cancelled 처리). **반복 예약은 403**
- `src/app/api/reservations/[id]/edit/route.ts` — POST 예약 변경 (동일 룸·동일 날짜 내 시간/제목/담당자/노트)
- `src/app/api/admin/auth/route.ts` — GET/POST/DELETE 관리자 세션 쿠키
- `src/app/api/admin/reservations/route.ts` — GET 전체 목록 (관리자 전용)
- `src/app/api/admin/series/[id]/route.ts` — PATCH `action: 'cancel'` (시리즈 일괄 취소, 관리자 전용)
- `src/app/api/rooms/route.ts` — GET 회의실 목록
- `src/app/api/access-code/route.ts` — GET 예약 코드 **필요 여부만** (공개, 코드값은 절대 노출 안 함)
- `src/app/api/admin/access-code/route.ts` — GET/PUT 예약 코드 (관리자 전용)

## DB 스키마
- `app_settings`: key(PK), value, updated_at — 런타임 설정 key/value. 현재 키: `reservation_access_code`
- `rooms`: id, name, color, hidden, sort_order — 비전홀 + 은혜성전 20개 시드 데이터
- `reservation_series`: id(TEXT/UUID), title, room_id, person_in_charge, email, notes, recurring, recurring_until, status(pending/approved/rejected/cancelled), rejection_reason, created_at
- `reservations`: id, series_id(→reservation_series), series_index, title, room_id, start_time, end_time, person_in_charge, email, notes, status(pending/approved/rejected/cancellation_requested), rejection_reason, cancellation_reason, cancellation_requested_at, previous_status, created_at, updated_at, previous_start_time, previous_end_time
- Postgres: Vercel Marketplace에서 Neon 연동 시 `POSTGRES_URL` 또는 `DATABASE_URL` 자동 주입
- 시드는 rooms 테이블이 비어있을 때만 실행 (`count === 0` 체크)
- **장소를 바꿀 때 DELETE 는 거의 필요 없음.** 이름 변경·순서 변경·은퇴(숨김)는 전부 `ensureDbReady()`에서 처리됨
  - 이름 변경 → 마커 가드 마이그레이션 (`rooms_grace_rename_v1` 방식). 기존 예약이 그대로 붙어 있음
  - 순서 변경 → `ROOM_ORDER` 배열 수정. 재시작하면 수렴
  - 은퇴 → `UPDATE rooms SET hidden = true`. 예약은 캘린더에 그대로 남음
  - 완전 삭제 → 참조가 없을 때만 지우는 자기방어형 DELETE (`은혜성전 교실 5` 방식)
- **정말로 전체 초기화가 필요하면 반드시 백업 먼저.** `npm run backup` → 그 다음 `DELETE FROM reservations; DELETE FROM rooms;`
  - Neon Free 는 **시점 복구 6시간**뿐. WHERE 없는 DELETE 를 하루 뒤에 알아차리면 복구 불가
- 스키마 마이그레이션: `ensureDbReady()`에서 `ADD COLUMN IF NOT EXISTS`로 idempotent 처리
- **`SCHEMA_VERSION` 버전 게이트.** `app_settings.schema_version`이 현재 값과 같으면 DDL 전체를 건너뜀
  - 예전에는 콜드스타트마다 27회 왕복(약 2.7초)을 냈음. Vercel은 **인스턴스가 새로 뜰 때마다** 이걸 다시 하므로 트래픽이 몰릴 때 가장 비쌌음 → 현재 **2회** (버전 확인 + ROOM_ORDER) (2026-09 수정)
  - **DDL을 바꾸면 `SCHEMA_VERSION`도 반드시 올릴 것.** 안 올리면 기존 DB에 새 마이그레이션이 영영 적용되지 않음
  - **실패하면 버전을 기록하지 않음** → 다음 콜드스타트에서 재시도. 없는 스키마를 있다고 도장 찍으면 실패가 영구히 가려짐 (예: 새 DB가 중복예약 제약 없이 서비스되는데 로그 한 줄만 남음)
  - `isConcurrentCatalogRace()`: 동시 콜드스타트가 같은 카탈로그 행에서 부딪히는 경우(`tuple concurrently updated`, `42710`, `42P07`)를 **성공으로 처리.** 이긴 쪽이 동일한 작업을 이미 했기 때문
    - 이게 실제 버그였음. 8개 동시 콜드스타트를 실측하면 1개가 `CREATE OR REPLACE FUNCTION`에서 이 오류를 냈고, 그 오류가 같은 try 블록 안의 **제약 존재 확인까지 통째로 건너뛰게** 만들었음

## 장소 숨김 (은퇴 처리)
- `rooms.hidden = true` 인 장소는 **일반 사용자 선택 목록에서 사라지지만 DB에는 남음.** 기존 예약은 그대로 캘린더에 표시됨 (예약 조회는 join으로 room_name/color를 가져오므로 영향 없음)
- **관리자는 계속 선택 가능.** `GET /api/rooms`가 세션 쿠키를 보고 관리자면 숨김 장소까지 반환 → 예약 폼·관리자 장소 필터가 자동으로 전체를 받음
- **서버에서도 강제.** `POST /api/reservations`가 `getRooms(isAdmin)`로 검증하므로 일반 사용자가 숨김 장소 id를 직접 POST해도 400 (`선택할 수 없는 장소입니다.`)
- `/api/rooms`는 쿠키를 읽어 동적이며 `fetchCache = 'force-no-store'` 필요 (Neon이 fetch로 통신 → 없으면 hidden 변경이 한동안 반영 안 됨)
- 현재 숨김: **비전홀 유아부실, 비전홀 유치부실** (2026-09). `ensureDbReady()`에서 `app_settings.rooms_hidden_init_v1` 마커로 **1회만** 실행 — 관리자가 나중에 숨김을 풀어도 재시작 때 다시 숨겨지지 않음
- 숨김/해제 UI는 아직 없음. 변경은 Neon 콘솔에서 `UPDATE rooms SET hidden = true/false WHERE name = '...'`

## 장소 표시 순서
- **`ORDER BY sort_order, id`.** id 순이 아님 — 나중에 추가한 장소가 물리적 위치와 무관하게 맨 끝에 붙는 문제 때문에 도입 (2026-09)
- 순서의 단일 출처는 `ensureDbReady()`의 **`ROOM_ORDER` 배열.** 여기 적힌 순서대로 `sort_order`가 매겨짐
- **매 콜드스타트마다 단일 UPDATE로 적용 (멱등).** `sort_order <> t.ord` 조건이 있어 실제로 다를 때만 씀. 순서 변경 UI가 없으므로 코드가 곧 정답이고, 재시작해도 항상 이 순서로 수렴
- **`applyRoomOrder()`는 일부러 `SCHEMA_VERSION` 게이트 밖에 있음.** 게이트 안에 넣으면 ROOM_ORDER를 고쳐도 버전을 올리기 전까지 반영이 안 됨 — 위의 "재시작하면 수렴" 성질이 깨짐
- 장소를 추가·이름 변경할 때는 **`ROOM_ORDER`에도 반영**해야 함 (누락되면 `sort_order = 0`으로 맨 앞에 옴)
- 은퇴(숨김) 장소는 원래 자리를 유지
- `은혜성전 교실 5`는 실재하지 않는 곳이라 **완전 삭제됨** (2026-09). 삭제문은 참조가 없을 때만 실행되도록 자기방어형이라 멱등하고, 예약이 붙어 있으면 스스로 건너뜀

## 장소 목록 (20개, 일반 사용자에게는 18개)
비전홀: 대예배실, 새가족실, 영아부실, 유아부실, 유치부실, 찬양대실, 2층 교실 1~4, 2층 올리브홀(초등부), 2층 초등부 교사실
은혜성전: 예배실, 친교실, 2층 교실 302·303·305·306, 청년부실, (구)부교역자실 (2026-09 개편)

## 장소명 영문 변환
- `translateRoomName(name)` 이 **단일 창구.** `roomNameMap`을 직접 조회하지 말 것
  - DB 이름은 접두사를 포함(`'은혜성전 친교실'`)하는데 `roomNameMap` 키는 접두사가 없어서(`'친교실'`), 예전에는 직접 조회가 **한 번도 매칭되지 않아 영어 모드에서 한국어 이름이 그대로 나왔음** (2026-09 수정)
  - `buildingNameMap`(비전홀→Vision Hall, 은혜성전→Grace Hall) + `roomNameMap` 조합으로 변환
  - 미등록 장소는 한국어로 fallback → 새 장소를 추가해도 화면이 깨지지 않음
- **장소 이름을 바꿀 때는 `roomNameMap`도 함께 갱신할 것**

## 환경변수 (.env.local)
```env
POSTGRES_URL=                     # Neon 연결 문자열 (Vercel 연동 시 자동, DATABASE_URL도 가능)
ADMIN_PASSWORD=bethel2024         # 관리자 비밀번호 (HMAC 서명 키로도 사용)
GMAIL_USER=                       # Gmail 주소 (선택, 미설정 시 bethel.oregon.dev@gmail.com)
GMAIL_APP_PASSWORD=               # Gmail 앱 비밀번호 16자리 (공백 없이)
UPSTASH_REDIS_REST_URL=           # Upstash Redis URL (선택, rate limiting용)
UPSTASH_REDIS_REST_TOKEN=         # Upstash Redis Token (선택, rate limiting용)
TWILIO_ACCOUNT_SID=               # Twilio Account SID (문자 알림)
TWILIO_AUTH_TOKEN=                # Twilio Auth Token
TWILIO_FROM_NUMBER=               # Twilio 구매 번호, E.164 (예: +15035551234)
TELEGRAM_BOT_TOKEN=               # @BotFather 발급 토큰 (텔레그램 알림)
TELEGRAM_CHAT_ID=                 # 담당자 그룹 chat_id (그룹은 -100… 음수)
```
- Gmail 앱 비밀번호: Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호
- `GMAIL_APP_PASSWORD` 미설정 시 이메일 건너뜀, 예약 기능은 정상 동작
- `UPSTASH_*` 미설정 시 rate limiting 비활성화 (관리자 로그인/예약/취소 제한 없음)
- `TWILIO_*` 셋 중 하나라도 미설정 시 문자 발송만 건너뜀 (경고 로그 후 예약은 정상 동작)
- `TELEGRAM_*` 둘 중 하나라도 미설정 시 텔레그램만 건너뜀 (경고 로그 후 예약은 정상 동작)

## 관리자 인증
- 쿠키 기반: `admin_auth` 쿠키 (httpOnly, sameSite lax, 프로덕션 secure, maxAge 없음 = 세션 쿠키)
- 값: `randomToken.issuedAt.hmac_sha256_signature` (HMAC-SHA256, `ADMIN_PASSWORD` 키)
- **서버 측 만료 12시간.** 발급시각이 서명 대상에 포함돼 있어 조작 불가
  - 쿠키의 "브라우저 닫으면 사라짐"은 브라우저의 약속일 뿐 서버 보장이 아님. 예전에는 토큰에 시각이 없어서 **쿠키 값이 유출되면 `ADMIN_PASSWORD`를 바꿀 때까지 무기한 유효**했음 (2026-09 수정)
  - 구형 2-파트 토큰은 검증 실패 → 재로그인. 하위호환 없음
- 비밀번호 비교는 `adminPasswordMatches()` — 양쪽을 SHA-256으로 고정 길이화한 뒤 `timingSafeEqual`. 길이 자체가 정보를 흘리므로 해시를 먼저 함
- `src/lib/auth.ts`의 `createAdminSession()` / `verifyAdminSession()` 사용
- `sessionStorage.adminVerified` 이중 체크: 브라우저 닫으면 sessionStorage 초기화 → 재접속 시 무조건 비밀번호 재입력 (브라우저 세션 복원 우회)

## 예약 상태 흐름
```
[신청] → approved (즉시 확정)
approved → cancelled (취소 신청 시 즉시 처리)
```
- 신청 즉시 `status = 'approved'`로 INSERT (승인 대기 없음)
- `checkConflict()`: `status IN ('approved', 'cancelled')` 제외 — `approved`만 충돌 체크 대상
- `cancelled` 예약: DB에 보존 (캘린더 조회에서 제외, 관리자 취소 목록에서 확인 가능)

## 예약 변경 플로우
- 캘린더/목록에서 예약 선택 → "변경하기" 버튼 (오늘 이후 + `approved` 예약에만 표시)
- `EditRequestModal` (`ReservationDetailPopover.tsx`): 이메일 본인 확인 + 시작/종료 시간(15분 단위) + 제목·담당자·노트 수정
- **장소와 날짜는 변경 불가** — 모달에 읽기 전용으로 표시, 바꾸려면 취소 후 재예약 (안내 문구 노출)
- `POST /api/reservations/[id]/edit` → `updateReservation()`
  - 검증: 이메일 일치(403) → `status='approved'`(400) → 지난 예약 차단(Pacific 기준, 400) → 새 시작/종료의 날짜가 원래 날짜와 동일(400) → 시작<종료(400) → `checkConflict(room_id, start, end, excludeId=id)`(409) → 변경 내용 유무(400)
  - 클라이언트가 보낸 `HH:MM`은 서버에서 `:00`을 붙여 정규화 (DB의 `T09:00:00` 형식과 문자열 비교가 정확해야 함)
- 이력: `updated_at` 갱신 + 시간이 실제로 바뀐 경우에만 `previous_start_time`/`previous_end_time` 저장 (SQL `CASE WHEN`, 제목만 고쳐도 기존 시간 이력 유지)
- 알림: `sendReservationUpdatedEmail` (변경된 필드만 `기존 → 신규` 취소선 표기) + `buildUpdateSmsMessage` (`[변경]`)
- 반복 예약은 **단건만** 변경 가능 (시리즈 일괄 시간 변경 없음)
- Rate limit: `checkEditLimit` IP 60회/분 + `checkEditEmailLimit` 이메일 10회/분
- **관리자 경로**: `PATCH /api/reservations/[id]` + `{ action: 'edit' }` (관리자 세션 필수)
  - 같은 `applyReservationEdit()`를 호출하되 **이메일 확인 생략** + **지난 예약도 수정 허용** (`allowPast: true`)
  - 관리자 목록의 `approved` 행에 "변경" 버튼 → `EditRequestModal admin` (이메일 입력란 숨김)
  - 알림 이메일·SMS는 관리자 변경에도 동일하게 발송 (신청자가 변경 사실을 알아야 함)
- 관리자 상세보기 모달에 `변경 전 시간`(취소선)·`변경일시` 표시 — `previous_*`/`updated_at`이 있을 때만

## 취소 신청 플로우
- 캘린더에서 예약 블록 클릭 → `ReservationDetailPopover` → "취소 신청하기" 버튼 (오늘 이후 예약에만 표시)
- `CancelRequestModal`: 단건(`scope=one`) 또는 시리즈 이후 전체(`scope=series`) 선택 + 사유 입력
- 제출 성공 시 즉시 `status = 'cancelled'`로 UPDATE → 완료 안내 화면 표시 ("취소 완료") → "확인" 클릭 시 닫힘
- `POST /api/reservations/[id]/cancel` → `requestCancellation()` or `requestCancellationSeries()`
- 시리즈 취소는 `PATCH /api/admin/series/[id]`로 일괄 처리

## 접근 통제 (중요)
- **공개 캘린더 응답은 컬럼 화이트리스트.** `getReservations()`는 `PublicReservation`에 있는 컬럼만 SELECT
  - 예전에는 `SELECT r.*`라서 **인증 없는 `GET /api/reservations`가 모든 예약자의 이메일을 내려보냈음.** 이메일은 취소·변경의 유일한 자격증명이라, 긁어서 남의 예약을 취소·변경할 수 있었음 (2026-09 수정)
  - 라우트에서 지우지 않고 **쿼리에서 화이트리스트**하는 이유: 나중에 `ADD COLUMN` 해도 기본이 비공개가 됨
  - 공개: `id, series_id, title, room_id, start_time, end_time, person_in_charge, notes, status, room_name, room_color` / 비공개: `email`, 취소 사유, 변경 이력(`previous_*`, `updated_at`), `created_at`
  - `getReservationById()`는 **서버 전용**이라 `email` 유지 (소유권 검증에 필요). 단건 공개 GET 라우트는 없음
  - 관리자는 별도 쿼리 `getAllReservationsForAdmin()`로 전체 컬럼을 받음
- **관리자 판정은 서명된 세션 쿠키로만.** `verifyAdminSession(cookies().get('admin_auth')?.value)`
  - `?admin=true` 쿼리 파라미터는 **클라이언트 UI 힌트일 뿐 서버가 신뢰하지 않음.** 예전에는 이걸 신뢰해서 인증 없이 1달 제한 해제 + 반복예약 500건 + 알림 억제가 전부 가능했음 (2026-09 수정)
  - 예약 폼도 `GET /api/admin/auth`로 실제 세션을 확인한 뒤에만 관리자 UI를 노출
- **반복 예약은 서버에서 관리자 전용으로 강제** (403). UI 숨김만으로는 부족했음
- **공유 예약 코드** — 교인만 쓰게 하는 최소 안전장치 (honor system, 인증이 아님)
  - `app_settings.reservation_access_code`에 저장 → **관리자 화면 '설정' 탭에서 변경.** 코드는 결국 유출되므로 재배포 없이 바꿀 수 있어야 해서 env가 아니라 DB에 둠
  - **코드 미설정 시 게이트 OFF** (fail-open). 관리자가 켤 때까지 앱은 그대로 동작
  - 검증은 `POST /api/reservations`에서, DB를 건드리기 전에. 관리자는 면제
  - 비교는 `trim()` + 소문자 — 사람이 손으로 입력하는 코드라 대소문자·공백에 관대해야 함. 저장 시엔 공백 포함 코드를 거부
  - 클라이언트는 성공 시 `localStorage['bethel_reservation_code']`에 기억, 403이면 삭제
  - `GET /api/access-code`는 **필요 여부(`{required}`)만** 반환. 코드값은 절대 내려보내지 않음
  - 이 라우트에는 `dynamic = 'force-dynamic'` **과** `fetchCache = 'force-no-store'` 둘 다 필요. Neon 드라이버가 fetch로 통신하므로 fetchCache 없으면 코드를 바꿔도 한동안 옛 값이 응답됨

## 시간대 원칙 (중요)
- **"오늘"/"지금"에 대한 모든 판단은 서부시간(`America/Los_Angeles`) 기준.** Vercel 서버는 UTC로 돌고 사용자 브라우저는 어느 시간대든 될 수 있어서, `new Date()`를 그대로 쓰면 태평양 오후 5시 이후 "내일"로 넘어가 당일 예약/변경이 막힘
- 반드시 `src/lib/date.ts`의 헬퍼만 사용 — `America/Los_Angeles` 문자열과 `toISOString().slice(0,10)`을 컴포넌트/라우트에 직접 쓰지 말 것
  - `pacificDateKey(d?)` — 'YYYY-MM-DD' (오늘 판정, 지난 예약 차단, 상태 비교)
  - `pacificTodayDate()` — 서부시간 연/월/일을 가진 **로컬 자정** Date (캘린더 네비게이션 state용. 뷰들이 `getFullYear()` 등 로컬 getter로 되읽기 때문)
  - `pacificNow()` — `{ dateKey, totalMinutes }` (일간 뷰 현재 시간 라인)
  - `toDateKey(d)` — Date의 **로컬** 성분으로 키 생성 (캘린더 격자 셀. 셀은 서부 달력일을 나타내는 로컬 자정 Date이므로 `pacificDateKey()`와 비교해도 정확)
  - `normalizeDateTime(raw)` — **클라이언트가 보낸 시각의 유일한 검증·정규화 창구.** `'YYYY-MM-DDTHH:MM(:SS)'`을 받아 19자로 정규화, 불가능한 시각이면 `null`
    - 예약 **생성과 변경 양쪽**이 같은 함수를 씀. 예전에는 생성 경로에 검증이 아예 없어서 `new Date(x) >= new Date(y)`가 `NaN >= NaN`(=false)로 통과해 버렸고, 나중에 배타 제약이 거부하면서 400이 아니라 **500**으로 나갔음 (2026-09 수정)
    - 정규식만으로는 부족함 — `2026-02-30T25:00`은 형식은 맞지만 실재하지 않음. 실제 날짜 검증까지 함께 함
    - 19자 통일이 중요한 이유: 앱 전체가 이 값들을 **문자열로 비교**하므로 16자 행이 섞이면 조용히 잘못 정렬됨
- DST는 `Intl.DateTimeFormat`이 처리 → PST/PDT 분기 불필요
- 날짜/시간 비교는 가능하면 `YYYY-MM-DDTHH:MM:SS` **문자열 비교**로 (DB 저장 형식과 동일, 시간대 파싱 없음). 1달 제한·시작<종료·같은 날짜 검증 모두 이 방식
- 적용 범위: 캘린더 4개 뷰 + 팝오버 + 예약 폼(`max` 날짜) + 관리자 조회 범위 + 서버의 1달 제한 및 지난 예약 차단

## 문자(SMS) 알림
- **Twilio 사용.** 예약/취소/변경 시 `notification_recipients`에 등록된 담당자 전원에게 발송
- **메시지는 항상 1세그먼트(한글 70자) 안에 들어가도록 조립됨** — `buildSms()`가 단일 창구
  - 한글은 GSM-7이 아니라 **UCS-2**라 세그먼트당 70자, 2세그먼트로 넘어가면 67자/세그먼트 + **요금 2배**
  - 3줄 구성: `[태그] 날짜 시각` / `장소` / `제목 / 담당자`. 시각을 맨 앞에 두는 건 수신자가 가장 먼저 확인하는 정보이기 때문
  - **잘리는 건 제목뿐.** 장소·날짜·시각은 잘리면 쓸모가 없고, 전체 내용은 이메일·텔레그램에 이미 있음 (둘 다 길이 제한 없음)
  - 남은 예산을 계산해 자름 — 장소명이 5자(`친교실`)~20자(`비전홀 2층 올리브홀(초등부)`)로 편차가 커서 고정 자르기로는 보장 불가
  - `담당자`는 자유 입력(이름 또는 전화번호)이라 10자로 함께 제한
  - `[변경]`의 `(기존 HH:MM-HH:MM)`은 **제목 자리가 6자 이상 남을 때만 표시.** 변경은 같은 날짜 안에서만 되므로 기존 시각에 날짜를 다시 넣지 않음
  - 시각은 저장된 문자열을 슬라이싱해서 만듦 (`new Date()` 파싱 없음) → 서버 시간대와 무관
  - 실측: 스트레스 1200건 최대 70자, 2세그먼트 0건
- **이메일-투-SMS 게이트웨이는 사용 금지** — 2026-08 조사 결과 폐기함:
  - Gmail이 `250 OK`로 수락하고 통신사 MX도 수락하지만 **반송 없이 조용히 폐기**됨. 한글/영문·제목 유무·SMS/MMS 게이트웨이·통신사 5곳 전부 실패 (총 9통 미도착)
  - AT&T(`txt.att.net`), Sprint(`messaging.sprintpcs.com`)는 **MX 레코드조차 없음** — 서비스 종료
  - 실패를 알 방법이 없다는 게 치명적이었음. Twilio는 오류 코드로 반환 (예: `20003 Authenticate`)
- `notification_recipients.carrier` 컬럼은 그 시절 잔재. **nullable로 변경, 아무도 읽거나 쓰지 않음** (기존 행의 값만 남아 있음). 관리자 UI에서 통신사 선택 제거
- 전화번호는 입력받은 그대로 저장하고 **발송 시점에 `toE164()`로 정규화** (10자리는 미국 번호로 간주해 `+1` 부착). 변환 실패 시 그 수신자만 건너뛰고 로그
- 발송 실패는 예약을 실패시키지 않음 — 수신자별 `try/catch`로 로그만 남김

## 텔레그램 알림
- **담당자 알림의 주 채널.** 미국 SMS는 A2P 10DLC 승인(캠페인 심사 10~15일)이 필요한데 텔레그램은 등록·비용이 없고 **아이폰에서도 동작**해서 먼저 붙였음
- **개별 DM이 아니라 그룹 하나로 발송.** 담당자 추가·제거가 그룹 초대로 끝나 DB·관리자 UI를 건드릴 필요가 없음. 봇은 자기에게 먼저 말을 건 적 없는 사용자에게 DM을 보낼 수 없다는 제약도 함께 회피
- `parse_mode: 'HTML'` 사용 → 제목·담당자·노트는 반드시 `esc()`로 이스케이프
- 날짜 표기는 저장된 문자열에서 성분을 직접 뽑아 만듦 (`formatDateTime`). `new Date(iso)` 파싱을 피해 서버 시간대와 무관하게 동일한 결과 — 요일만 로컬 성분으로 만든 Date에서 가져옴
- SMS와 **병렬로 함께 발송**되며 서로 독립적. 한쪽이 미설정이거나 실패해도 다른 쪽은 나감
- **관리자 예약도 알림을 보냄** (2026-09 수정). 예전에는 억제했는데, 조건이 "관리자로 예약하려는 의도"가 아니라 **세션 쿠키의 존재 여부**였음 → 관리자 패널에 한 번 로그인한 브라우저로 일반 폼에서 예약하면 알림이 조용히 사라졌음. 담당자가 자기 예약을 넣을 때 정확히 그 상황이 됨
- **반복 예약은 시리즈당 1통.** 매주 1년치면 52통이 되므로 회차별로 보내지 않음
  - 문자: `[예약] 8회 11/10~12/29 09:00` — 70자 제한이 있어 **시작 시각만** (모든 회차가 같은 시각, 나머지는 이메일·텔레그램에)
  - 텔레그램: 기간·시간·총 횟수 + **충돌로 제외된 날짜 수**까지 (담당자가 "7회 신청인데 왜 6건?"을 묻지 않도록)

## 알림 발송과 서버리스 (중요)
- **모든 이메일/문자 발송은 응답 반환 전에 `await` 해야 함.** Vercel은 응답을 보내는 순간 인스턴스를 얼리므로, `await` 없는 발송은 핸드셰이크 도중 죽고 아무것도 나가지 않음 — 로컬 dev에서는 프로세스가 살아있어 정상 동작하므로 발견하기 어려움
- 이메일과 문자는 `await Promise.all([...])`로 **병렬** 실행해 지연 최소화 (직렬로 하면 2배)
- 각 발송은 `.catch()`로 감싸 실패해도 예약 자체는 성공하도록 유지
- 적용 위치: 예약 생성/취소/변경, 관리자 승인·거절·취소승인·취소거절, 시리즈 일괄 처리

## 핵심 설계 결정
- 모든 예약은 신청 즉시 `approved`로 확정 (승인 대기 없음)
- 취소는 즉시 `cancelled` 처리 (삭제 대신 DB 보존, 캘린더에서는 필터링)
- 캘린더 뷰: 상태 배지 없음, 장소 색상 솔리드 블록만 표시 (빗금 패턴 없음)
- 반복 예약: 관리자 전용 (`/reserve?admin=true`). daily/weekly/monthly, 최대 500회 (매주 약 9.6년)
  - `recurring` 값과 `recurring_until` 형식을 검증한 뒤 **occurrence를 먼저 생성**하고, 비어 있으면 400
  - **`reservation_series` INSERT는 모든 조기 return을 통과한 뒤에 수행.** 예전에는 맨 앞에서 만들어서, 종료일이 시작일보다 이른 경우(`occurrences[0]`에서 크래시 → 500)와 모든 날짜가 충돌한 경우(409) 양쪽 모두 **고아 series 행**을 남겼음 (2026-09 수정)
  - bulk INSERT가 경합으로 실패하는 드문 경우에만 고아 행이 남을 수 있음. 트랜잭션 왕복을 매번 추가할 만한 빈도가 아니라고 판단해 그대로 둠
  - 충돌 날짜 자동 제외하고 나머지만 bulk INSERT
  - 생성 시 DB 쿼리 2번으로 고정 (범위 내 충돌 SELECT 1번 + 비충돌 건 UNNEST bulk INSERT 1번)
- 1달 날짜 제한: 일반 사용자는 오늘~1달 이내만 예약. 클라이언트(date input `max`) + 서버(세션 쿠키 기반 `isAdmin`) 이중 검증
- 이메일: 예약 신청 시 확인 메일 발송 (`sendReservationCreatedEmail` / `sendReservationCreatedBulkEmail`)
- 회의실별 색상 20가지 시드 데이터로 정의
- 일간/주간 뷰: 오전 6시~오후 11시, 1.5px/분, 겹침 감지 컬럼 레이아웃
- 충돌 감지: 같은 회의실 + 같은 시간대 이중 예약 방지 — **애플리케이션 + DB 2중 방어**
  - `checkConflict()`: `status IN ('pending','approved','cancellation_requested')` 와 시간 겹침 확인. 변경 시에는 `excludeId`로 자기 자신 제외
  - **DB 배타 제약 `reservations_no_overlap`** (2026-09 추가): `EXCLUDE USING gist (room_id WITH =, tsrange(...) WITH &&)`. `checkConflict`와 **동일한 상태 집합**을 조건으로 걸어 둘이 어긋날 수 없음
    - SELECT 후 INSERT/UPDATE 사이의 경합을 DB가 물리적으로 거부. 20개 동시 요청 → 정확히 1건만 저장됨을 실측
    - `tsrange` 기본 경계 `[)` → **맞닿음은 겹침 아님** (10~11시 다음 11시 시작 허용). 앱 로직과 동일
    - `start_time`이 TEXT라 `text::timestamp`는 인덱스 식에 못 씀 (DateStyle 의존 → IMMUTABLE 아님). `make_timestamp`로 조립하는 **`reservation_ts(text)` IMMUTABLE 함수**를 만들어 사용
    - 제약 위반은 `isOverlapViolation(e)` (SQLSTATE `23P01`)로 판별해 **409로 변환**. 적용 위치: 단건 생성, 반복예약 bulk, 예약 변경
    - 반복예약 bulk는 단일 statement라 한 건만 충돌해도 전체 롤백 → "다시 시도해 주세요" 안내
  - 기존 겹침 행이 있으면 제약 추가가 실패하므로 `ensureDbReady()`에서 오류를 로그만 남기고 진행 (앱 레벨 검사는 유지)
  - 충돌 메시지는 예약신청 버튼 바로 위에 표시
- **반복 예약 취소는 관리자 전용** (2026-09). 공개 경로는 `reservation.series_id`가 있으면 **403**
  - **변경(단건 시간 수정)은 교인도 가능.** 같은 날짜 안에서 한 회차의 시간만 바뀌어 파급이 작고, 매주 모임의 한 주만 옮기는 건 일상적인 요청이라 관리자를 거치게 할 이유가 없음
  - 만드는 것이 관리자 전용이니 지우는 것도 관리자 전용 — 권한이 대칭이 됨
  - 예전에는 예약자 이메일만 알면 공개 폼에서 **시리즈 전체를 한 번에** 취소할 수 있었음. 실제로 새가족 교육 226건이 그 경로로 사라짐
  - **서버에서 강제.** UI 숨김만으로는 부족 (`?admin=true` 때의 교훈). `scope` 파라미터 자체를 제거해 공개 경로는 구조적으로 단건만 처리
  - 캘린더 4개 뷰의 `canRequestCancel`에 `!series_id` 추가 (`canEdit`은 제외하지 않음) + 팝오버에 "반복 예약은 담당자에게 문의해 주세요" 안내 노출 (버튼이 그냥 사라지면 혼란스러움)
- **시리즈 일괄 취소**: 관리자 경로 전용 (`PATCH /api/admin/series/[id]`, `action: 'cancel'`)
  - 반복 예약은 관리자만 만들 수 있는데 **취소는 공개 경로에만 있었음** — 관리자가 자기가 만든 시리즈를 지우려면 예약자 이메일을 공개 폼에 입력하거나 회차를 하나씩 삭제해야 했음 (2026-09 수정)
  - 관리자 경로는 **이메일 확인을 생략**하고 **오늘 이후만** 취소 (지난 회차는 사용 기록으로 보존). 공개 경로의 "이 일정부터 이후"와 같은 원칙
  - 알림은 시리즈당 1통
- **묶기는 예약 목록(`approved`) 탭에서만.** 취소 목록과 전체 탭은 회차별로 그대로
  - 취소 목록: 어느 날짜가 빠졌는지가 중요
  - **전체 탭: 관리자가 시리즈의 개별 회차를 수정·삭제하는 창구.** 예약 목록 탭은 시리즈가 1행이라 회차별 버튼이 없음 → 그 행에 `seriesPerOccurrenceHint`("회차별 수정·삭제는 전체 탭에서")를 노출해, 버튼이 없는 것이 "관리자가 못 한다"로 읽히지 않게 함
  - 묶기 전에는 `청년부 식사 친교` 497건·`새가족 교육` 246건이 개별 행이라 **545행**이 나왔음 → 현재 **19행**
- **승인/거절 흐름은 전부 제거됨** (2026-09). 예약이 즉시 `approved`, 취소도 즉시 `cancelled`가 된 뒤로 `pending`·`cancellation_requested` 상태가 생기지 않아 죽은 코드였음
  - 제거: `PATCH` 의 `approve`/`reject`/`approve_cancellation`/`reject_cancellation` (단건·시리즈 양쪽), `POST /api/admin/reservations`(일괄 승인), 관련 db·email 함수 13개, 모달 4개, i18n 31키
  - 관리자 탭은 원래 `approved`/`cancelled`/`all` 셋뿐이라 `pending` 필터는 **도달 불가**였음 → 체크박스 선택·일괄 승인 UI도 함께 제거
  - **DB에 옛 상태 행 21건이 남아 있음** (전부 2026-03 테스트 데이터, 미래 건 0). `deleteReservation`은 `status='approved'`만 지우므로 UI로는 정리 불가
- Rate limiting: **IP + 이메일 2계층** (Upstash 미설정 시 **전부 무제한** — Vercel 환경변수 확인 필수)
  - IP: admin-login 5회/분, reservation·cancel·edit 각 60회/분
  - 이메일: reservation 5회/분, cancel 5회/분, edit 10회/분. 관리자는 이메일 계층 면제
  - **IP 단독 제한은 교회 WiFi에서 위험함.** 교인 전원이 공인 IP 하나를 공유하므로 예전 10회/분에서는 예배 후 공지 직후 11번째 사람부터 429였음 (2026-09 수정). 그래서 IP는 상한으로 완화하고 엄격한 제한을 이메일로 옮김
  - 이메일 계층은 단독 보안 경계가 아님 (주소를 바꾸면 우회) → IP 상한과 예약 코드가 함께 남아 있어야 함
- Vercel Postgres: 서버리스 환경에서 영구 저장, `data/` 디렉토리 불필요
- SendGrid/Resend 미사용 — 이메일은 nodemailer + Gmail SMTP, 문자는 Twilio

## UI 구성
- 레이아웃: 최대 너비 1280px (`max-w-screen-xl mx-auto`), 초과 시 양쪽 공백 + `border-x border-gray-200` 구분선
- 전체 앱 컨테이너: `h-screen overflow-hidden` — 뷰포트 높이 고정, 스크롤은 각 뷰 내부에서 처리
- `<header>` 안에 로고·버튼·공지 배너·캘린더 컨트롤·장소 필터 모두 포함 (sticky top-0). 로고 클릭 시 오늘 날짜 + 월간 뷰로 리셋
- 컨트롤 바: 1줄 — 일간/주간/월간/목록 토글 (왼쪽) + 일간 뷰일 때 "오늘" 버튼 (오른쪽 끝), 2줄 — ‹ 날짜/주/월 제목 › (가운데, 목록 뷰에서는 숨김)
- 기본 뷰: 모든 기기에서 월간.
- **뷰 전환 버튼 반응형**: 1024px 미만에서는 일간·월간·목록 세 버튼 표시, 1024px 이상에서는 일간·주간·월간·목록 전부 표시
- **목록 뷰**: 일간/주간/월간 옆 "목록" 버튼으로 전환. 오늘 이후 전체 예약을 주 단위 헤더 + 날짜별 카드로 표시. 네비게이션(‹ 오늘 ›) 숨김. fetch 범위: 오늘~1년 후. 각 카드: 제목 / 시간 / 장소 (3줄 구성, 좌측 5px 방 색상 border-l). 카드 클릭 시 선택(배경 진해짐) + 변경하기·취소 신청하기 버튼 표시 (장소와 같은 줄 오른쪽). 주 단위 sticky 헤더: `top: -0.2rem`으로 스크롤 시 살짝 올라간 위치에 고정
- 우측 상단: 장소 예약 신청, 관리자 모드 버튼. 예약 신청 버튼 클릭 시 `RulesModal` 표시 (장소 사용수칙 4개 항목 + 동의 체크박스) → 동의 후 `/reserve`로 이동
- 공지 배너: 큰 행사는 사용신청서(Google Drive 링크) 제출 안내
- **장소 필터**: "장소 필터 ▾" 버튼 클릭 시 패널 펼침, 장소 chip 클릭으로 멀티 필터링. 패널 열린 상태에서 선택 시 "선택 취소" 버튼 표시 (토글 버튼 오른쪽), 닫힌 상태에서 선택 시 "전체 보기" 표시. 패널 접힌 상태에서도 선택된 장소 chip은 그대로 표시 (클릭 시 해제 가능). 모바일에서는 패널이 오버레이 드롭다운으로 표시 (캘린더 위에 absolute 포지션, backdrop 클릭 시 닫힘). header row `relative z-50`으로 backdrop(`z-40`) 위에 위치. 같은 줄 오른쪽에 불러오는 중 표시 (범례 없음)
- **예약 상세 팝오버**: 일간/주간 캘린더 뷰에서 예약 블록 hover → 제목·장소·시간·담당자·노트 표시 + 변경하기(파랑)·취소 신청(빨강) 버튼
- **현재 시간 라인**: 일간 뷰에서 오늘 날짜일 때만 파란 가로선 표시. `Intl.DateTimeFormat` + `America/Los_Angeles` 타임존으로 DST 자동 처리. 30초마다 갱신
- **일간 뷰 고정 헤더**: 주간 스트립을 단일 `sticky top-0` 래퍼로 묶어 스크롤 시 항상 표시. 날짜 레이블은 page.tsx Row 2 (‹ 날짜 ›)로 이동. 주간 스트립 날짜 셀: 요일·날짜 사이 `gap-1`, 날짜·점 사이 `mt-1`
- **월간 날짜 셀 클릭**: 셀 전체가 클릭 가능, 클릭 시 해당 날의 모든 예약을 시간순으로 보여주는 모달 표시 (예약 0개이면 안내 메시지). 개별 예약 블록 hover 팝오버 없음. 모달 내 카드 기본 상태에서는 버튼 숨김 — 카드 클릭 시 선택(배경 진해짐) + 변경하기·취소 신청하기 버튼 표시 (`selectedModalId` state). 오늘 이후 예약에만 버튼 노출. 모달 닫힐 때 `selectedModalId` 초기화
- **스와이프 제스처**: 일간/주간/월간 뷰에서 터치 좌우 스와이프로 날짜 이동. `page.tsx`에서 native `touchstart/touchmove/touchend` 이벤트로 처리 (passive: false on move). 수평/수직 축 5px threshold로 판별 후 lock. `swipeX`/`isDragging` state → 각 뷰에 `swipeOffset`/`swipeDragging` props로 전달. 완료 시: 220ms animate off-screen → navigate → 반대 edge 즉시 이동 → `requestAnimationFrame` 이중 호출 후 0으로 animate. 헤더(주간 스트립, 요일 헤더, 시간 레이블)는 transform 외부에 고정, 예약 그리드만 `translateX`
- **월간 뷰**: 요일 헤더(일월화수목금토)는 고정, 날짜 그리드만 `overflow-y-auto` 스크롤. 그리드 row: `minmax(var(--month-cell-min-h), 1fr)` — CSS 변수로 반응형 처리 (`globals.css`: 640px 미만 100px / 640px 이상 130px). JS state 없이 순수 CSS로 SSR 안전하게 적용. 셀에 `overflow-hidden`으로 콘텐츠 클리핑
- **월간 뷰 예약 블록**: 셀당 최대 3개 표시, 초과 시 `+N개` 표시. 모바일(`< sm`)에서는 텍스트 숨김(`hidden sm:inline`), 색상 바만 표시 (`h-3 sm:h-auto sm:leading-5`)
- 예약 신청 폼: 타이틀, 장소(드롭다운), 날짜, 시작/종료 시간(15분 단위), 반복설정(관리자 전용), 담당자, 이메일, 노트(선택)
  - 일반 사용자: 날짜 `max` = 오늘+1달, 반복 섹션 숨김. 관리자(`?admin=true`): 날짜 제한 없음, 반복 섹션 표시, 사용수칙 모달 미표시
  - **모달의 닫기 버튼은 `닫기`, 폼의 취소 버튼은 `취소`.** 시리즈 취소 모달에서 `취소`/`전체 취소`가 나란히 놓여 헷갈렸음 (2026-09 수정)
- 모든 input/select/textarea: `text-base`(16px) — iOS Safari 자동 확대 방지 (예약 폼 + 관리자 페이지 모두 적용)
- 관리자: "예약하기" 버튼 + 탭(예약 목록 / 취소 목록 / 전체) + 설정. 예약 목록: 삭제 가능. 취소 목록: 개별 행으로 표시(시리즈 묶음 없음), 상세보기만. 전체: 상태 컬럼 표시(거절 제외)
- **관리자 상세보기**: 각 행 버튼 영역 맨 왼쪽 "상세보기" 버튼 → `ReservationDetailModal` 팝업 (제목·상태·장소·시간·담당자·이메일·메모·취소사유·신청일). `z-[200]`으로 장소 필터 패널(`z-50`)보다 항상 위에 표시
- **관리자 검색**: 장소 필터와 같은 줄, 오른쪽 남는 공간 전체 (`flex-1 min-w-0`). 세 탭(예약 목록·취소 목록·전체) 모두에 적용되고 **탭을 바꿔도 검색어가 유지됨** — 같은 사람의 예약과 취소를 잇달아 찾는 경우가 대부분
  - 대상은 `searchHaystack()` 단일 출처: 제목·담당자·**이메일**·장소(한/영 양쪽)·노트·취소사유·날짜·시각
    - 이메일을 넣은 이유: 공개 쿼리는 이메일을 내려보내지 않으므로 **관리자 목록이 유일한 조회 경로.** 몇 달 전 예약을 두고 전화가 왔을 때 사람을 특정하는 수단
    - 장소는 저장명(`은혜성전 친교실`)과 표시명(`Grace Hall Fellowship`)을 둘 다 넣음 — 화면에 보이는 대로 검색해도 걸려야 함
    - 날짜는 `2026-09-06` / `09/06` / `9/6` 세 형태. 사람이 말하는 방식으로 입력됨
  - **공백으로 나눈 모든 항이 일치해야 함(AND).** `고형석 청년부`가 둘 중 아무거나가 아니라 그 사람의 청년부 예약으로 좁혀짐
  - 결과 0건이면 "검색 결과가 없습니다." (장소 필터 0건 메시지와 구분)
  - 검색 중에는 장소 필터 옆에 건수 표시 (`sm` 이상). 시리즈 묶음 행은 **일치한 회차만** 세므로 날짜로 검색하면 `246건`이 아니라 그 날짜의 건수가 나옴
  - input 은 `text-base`(16px) — iOS Safari 포커스 확대 방지
- **관리자 장소 필터**: 메인 캘린더와 동일한 UI (토글 버튼, 선택 chip, 오버레이 패널). `/api/rooms`에서 전체 20개 장소 fetch. 선택한 장소에 내역 없으면 "선택한 장소의 예약 내역이 없습니다." 표시
- 관리자 테이블 컬럼 너비 고정: 장소(160px)·시간(160px)·담당자(120px)·신청일시(140px)·버튼(`w-px`)·제목(나머지). 전체 탭에만 상태 컬럼 추가
- 관리자 반응형: 1000px 기준 테이블 ↔ 카드 레이아웃 전환 (커스텀 Tailwind breakpoint `admin: 1000px`), 최대 너비 1280px (`max-w-screen-xl`)
- **관리자 상단 버튼 행**: 예약하기 / [예약 목록·취소 목록·전체] / 설정 / 새로고침 — **320px에서도 한 줄**에 들어가도록 튜닝됨
  - font-size `clamp(10px, 3.5vw, 14px)`, padding `clamp(4px, 1.5vw, 12px)`, 간격 `gap-1.5 sm:gap-2`
  - `flex-wrap`은 안전망 — 더 좁아지면 가로 넘침 대신 줄바꿈
  - 새로고침 버튼은 425px 미만에서 ↻ 아이콘
  - **알림 수신자는 상단 버튼이 아니라 '설정' 화면의 하위 섹션.** 예전에는 별도 탭이었는데 버튼 행이 모바일 가로를 넘겨서 설정 안으로 옮김 (2026-09). `adminView`는 `'reservations' | 'settings'` 둘뿐
- 제목 말줄임: 모든 뷰(일간 캘린더 블록, 주간, 월간, 목록 보기, 팝오버, 관리자 테이블/카드)에서 긴 제목은 `truncate`로 처리
