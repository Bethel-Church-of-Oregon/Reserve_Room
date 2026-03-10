# Bethel Reserve Room — CLAUDE.md

교회 회의실 예약 웹 앱. Next.js 14 App Router + SQLite.

## 실행
```bash
npm run dev      # 개발 (포트 8000, 빌드 불필요)
npm run build && npm start  # 프로덕션 (포트 8000)
```

## Tech Stack
- **Framework**: Next.js 14.2.3 (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite via `better-sqlite3`
- **Config**: `experimental.serverComponentsExternalPackages: ['better-sqlite3']` in `next.config.mjs`

## 주요 파일
- `src/lib/db.ts` — DB 싱글톤, 스키마, 모든 쿼리, TypeScript 타입
- `src/app/page.tsx` — 메인 캘린더 (week/month, 클라이언트 컴포넌트)
- `src/app/reserve/page.tsx` — 예약 신청 폼 (Suspense로 useSearchParams 감쌈)
- `src/app/admin/page.tsx` — 관리자 패널 (로그인 → 승인/거절/삭제)
- `src/components/WeekView.tsx` — 주간 캘린더 (오전 6시~오후 11시, 1.5px/분)
- `src/components/MonthView.tsx` — 월간 캘린더
- `src/app/api/reservations/route.ts` — GET, POST
- `src/app/api/reservations/[id]/route.ts` — PATCH (승인/거절), DELETE
- `src/app/api/admin/auth/route.ts` — GET/POST/DELETE 관리자 세션 쿠키
- `src/app/api/admin/reservations/route.ts` — GET 전체 목록 (관리자 전용)
- `src/app/api/rooms/route.ts` — GET 회의실 목록

## DB 스키마
- `rooms`: id, name, color — 한국 교회 회의실 15개 시드 데이터
- `reservations`: id, title, room_id, start_time, end_time, person_in_charge, notes, status(pending/approved/rejected), rejection_reason, created_at
- DB 파일: `data/reservations.db` (gitignore 적용, 첫 실행 시 자동 생성)

## 관리자 인증
- 쿠키 기반: `admin_auth=true` (httpOnly, 8시간)
- 비밀번호: `.env.local`의 `ADMIN_PASSWORD=bethel2024`

## 핵심 설계 결정
- 승인 대기 예약: CSS 빗금 패턴 (`.reservation-pending`)
- 확정 예약: 회색 계열 표시
- 회의실별 색상 15가지 시드 데이터로 정의
- 주간 뷰: 오전 6시~오후 11시, 1.5px/분, 겹침 감지 컬럼 레이아웃
- 충돌 감지: 같은 회의실 + 같은 시간대 이중 예약 방지
  - `checkConflict()` 함수: `status != 'rejected'`인 기존 예약과 시간 겹침 확인
  - 충돌 메시지는 예약신청/취소 버튼 바로 위에 표시
- `data/` 디렉토리는 gitignore (`.gitkeep`만 커밋) — git 작업 시 DB 유지됨

## UI 구성
- 상단: 주간/월간/오늘 토글 + 확정/승인대기 범례
- 우측 상단: 장소 예약 신청, 관리자 모드 버튼
- 예약 신청 폼: 타이틀, 날짜, 시작/종료 시간(15분 단위), 장소, 담당자, 노트(선택)
- 관리자: 승인 대기 리스트 → 체크박스 선택 → 승인/거절(사유 입력) / 확정 예약 삭제

## Git / 배포
- GitHub repo: `https://github.com/Bethel-Church-of-Oregon/Reserve_Room`
- 인증: Personal Access Token (비밀번호 로그인 미지원)
- `git config --global credential.helper store` 로 토큰 저장 가능
