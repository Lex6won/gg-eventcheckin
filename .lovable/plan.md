
# 운영 리스크 분석 & 해결 설계

지적해주신 10개 항목을 현재 코드/스키마에 비추어 검증했습니다. 일부는 이미 부분적으로 구현되어 있어 그 위에 보강하는 형태로, 일부는 새로 도입합니다. 우선순위(P0=긴급, P1=중요, P2=개선)와 함께 정리합니다.

---

## 현재 상태 사실 확인 (코드/DB 점검 결과)

- `attendees`에 `UNIQUE (event_id, lower(email)) WHERE email IS NOT NULL AND status <> 'cancelled'` 부분 유니크 인덱스 **이미 존재** (1번 일부 해결됨)
- `trainees`에 `(training_id, lower(email))` 유니크 인덱스 **이미 존재** + 레거시 `(training_id, name, organization)` 유니크도 존재 (1번 일부 해결됨)
- 그러나 RPC(`register_attendee_pre`)는 이메일 정규화 시 `lower(trim(...))`을 적용하지만 **공백·점/플러스 변형은 정규화 안 됨** → 우회 가능
- `attendees` INSERT RLS: `WITH CHECK (true)` (5번 미해결, 누구나 임의 데이터 삽입 가능)
- `RegisterPage`의 정원 체크는 **클라이언트에서 count → 분기**, RPC `register_attendee_pre`(이벤트용)는 정원 검증 자체가 없음 (3번 미해결)
- 서명: `signatures` 버킷 존재하지만 코드는 **Base64 dataURL을 그대로 RPC에 넘겨 DB에 저장** 중 (4번 관련, 메모리에 “Base64로 저장” 정책 등록되어 있음)
- 상태(`예정/진행중/완료`)는 수동 변경, 자동화 없음 (8번 미해결)
- 사전신청 종료/마감 화면은 `RegisterPage`에 일부 있으나 “완료” 상태에서만 막힘. `event_date` 경과/시간 종료 후 자동 마감 없음 (10번 부분)
- 키오스크는 일반 admin 세션 그대로 사용 (6번 미해결)
- 내보내기는 파일명에 행사명/타임스탬프 미포함, 다운로드 로그 없음 (7번 미해결)

---

## 해결 설계

### 1) [P0] 중복 신청 데이터 무결성 강화

- DB 유니크 인덱스는 OK. 추가 작업:
  - **이메일 정규화 헬퍼 함수** `public.normalize_email(text)`: `lower(trim(...))` + 양끝 공백/내부 공백 제거 + (옵션) Gmail용 `+태그` 제거. 모든 RPC가 이 함수를 사용하도록 통일.
  - 사전신청/체크인/walk-in RPC 모두 동일 정규화로 비교 → "약간 다른 이메일" 우회 차단.
  - 프론트(`RegisterPage`)에서 중복(`status:'duplicate'`) 화면을 더 명확히: “이미 사전 신청되었습니다. 당일 현장에서 같은 이메일로 체크인하세요.” + “현장 체크인 가기” 버튼 노출(이미 일부 존재, UX 강화).
  - 이름+소속 기반 레거시 `idx_trainees_unique_active` 인덱스는 **이메일 도입 이후 충돌 위험**(동명이인이 같은 기관에서 다른 이메일로 사전신청 시 막힘). 이 인덱스는 **드롭** 권장.

### 2) [P1] 현장 식별 신뢰성 — 보조키 도입

이메일 오타로 walk-in 폭증 방지.

- DB: `attendees`/`trainees`에 `lookup_code text` 추가(6자리 숫자, 행사 내 유니크). 사전신청 성공 시 발급해 응답으로 반환.
- 사전신청 완료 화면에서 **6자리 코드**를 큼지막하게 표시 + “현장에서 이메일 또는 이 코드로 체크인” 안내.
- 현장 체크인 입력칸: **이메일 또는 코드**(또는 “이름+휴대폰 뒷4자리”) 둘 다 허용.
  - 신규 RPC: `lookup_attendee(p_event_id, p_query)` — 이메일/코드/(이름+phone last4) 조건으로 단건 매칭, 다건이면 `multiple` 반환 후 관리자가 후보 중 선택.
- `AttendancePage`/`AdminEventCheckin`의 검색 입력을 단일 통합 필드(“이메일 또는 코드”)로 변경.

### 3) [P0] 정원 경쟁 조건

- 이벤트는 정원 개념 없음(스키마상). 교육은 `register_trainee` RPC가 `SELECT ... FOR UPDATE`로 행 잠금 후 카운트 → OK.
- 그러나 `RegisterPage`는 **클라이언트 카운트 결과로만 willBeWaitlisted 표기** → 동시성 시 표시는 부정확하지만, 실제 등록은 RPC가 보호하므로 데이터는 안전.
- 보강:
  - 사전신청 RPC가 `full` / `waitlisted` / `registered`를 권위 있게 반환하므로 클라이언트는 **표시용 카운트**만 사용하고, 결과는 RPC 응답에 따라 “대기자 N번/마감” 화면을 보여줌(이미 그런 구조). 추가로 클라이언트 카운트는 “참고용”임을 코드에 주석/표기.
  - 교육 사전신청 RPC가 정원 체크에 `walk_in`도 포함하고 있어, **walk-in이 사전 정원을 잠식**. 결정사항(“정원은 사전신청에만”)에 맞게 카운트에서 `walk_in` 제외하도록 수정.

### 4) [P1] 서명 저장 정책

- 메모리 정책: “서명은 Base64 Data URL로 DB에 저장”(현 구현). 유지하되 운영 가드 추가:
  - 클라이언트에서 서명 PNG를 **고정 사이즈로 리샘플링(예: 600×200)** + `image/png` 압축 파라미터 적용 → 평균 5–15KB 수준으로 통제. 헬퍼 `compressSignature(canvas)` 신설.
  - DB 컬럼은 그대로 text 유지하되 RPC에서 길이 가드(예: 200KB 이상 거절).
  - 정책 문서: 보관 기간 = 행사 종료 후 6개월(설정 가능). 별도 cron(8번과 같이) 행사 종료 +N개월 도래 시 `signature_url=NULL`로 비식별화하는 함수 `purge_expired_signatures()`를 만들고 `pg_cron`에 등록.
  - `signatures` 스토리지 버킷은 사용하지 않으므로 **삭제 또는 비공개 전환 + RLS 잠금**.

### 5) [P0] attendees/trainees 공개 INSERT RLS 위험

현재 `WITH CHECK (true)` → 봇/스크립트가 임의 row 삽입 가능.

- **공개 INSERT 정책 제거**. 대신:
  - 모든 등록 경로를 SECURITY DEFINER RPC(`register_attendee_pre` / `walk_in_attendee` / `checkin_attendee` 및 trainees 동등 RPC)로만 처리.
  - 이 RPC들이 `events`/`trainings`의 `access_code` 또는 `id`로 행사 존재·상태(`!= '완료'`, 신청 마감 시각 이내)를 검증하는 게이트 역할 강화.
  - `GRANT EXECUTE ON FUNCTION ... TO anon, authenticated` 부여.
  - 추가 봇 방지: RPC에 간단한 **레이트 리밋**(같은 이메일/IP 단위는 어렵지만, RPC 내 `pg_sleep(0.2)` + 동일 이메일 최근 N초 재호출 차단 테이블) — 과도하면 생략 가능.
  - 클라이언트 측 hCaptcha 등은 운영 부담이라 1차 범위 제외, 옵션으로만 메모.

### 6) [P1] 키오스크 세션 보안

- **키오스크 전용 라우트 잠금**:
  - `/admin/.../checkin` 진입 시 “키오스크 모드 시작” 화면에서 관리자 비밀번호 재확인 → `sessionStorage.kioskMode=true`, `kioskExpiresAt`(예: 8시간) 저장.
  - 키오스크 모드 ON일 때 `AdminLayout`의 사이드바/관리자 메뉴 비표시(전용 헤더만), 다른 admin 라우트로 이동 시도 시 “키오스크 종료” 비밀번호 요구.
  - **자동 로그아웃**: 마지막 인터랙션 후 N분(기본 15분) 비활동이면 `supabase.auth.signOut()` + 키오스크 종료, 로그인 페이지로 리다이렉트.
  - 옵션(권장): 키오스크 전용 제한 권한 토큰을 위해 Edge Function `kiosk-checkin`(체크인/walk-in만 호출 가능)을 도입. 키오스크는 일반 로그인 없이 행사별 1회용 PIN으로 토큰 받기. → 범위 큼, 2차 작업으로 분리.

### 7) [P1] 엑셀/PDF 내보내기 개인정보 통제

- `exportAttendees.ts` 수정:
  - **파일명 표준화**: `[행사명]_참석자명부_YYYYMMDD-HHmm.xlsx` (특수문자 sanitize).
  - 다운로드 직전 **재인증 모달**: 비밀번호 재입력(또는 이메일 OTP). `sessionStorage`에 `recentReauthAt` 기록, 10분 이내 재요청은 통과.
  - 새 테이블 `export_audit_logs(id, user_id, target_type, target_id, file_type, includes_signature, row_count, created_at)` + RLS(super_admin만 SELECT, 본인 INSERT). 다운로드 시 INSERT.
  - 옵션: “서명 포함 / 제외” 토글을 다운로드 다이얼로그에 두어 기본은 **서명 제외**, 체크 시에만 포함.

### 8) [P1] 행사·교육 상태 자동 전환

- DB 함수 `auto_transition_event_statuses()`:
  - `events`: `event_date < today` 또는 (`event_date = today AND end_time < now()`) 이고 `status <> '완료'` → `status='완료'`. `event_date = today AND start_time <= now() <= end_time` → `진행중`. 그 외 미래 → `예정` 유지.
  - `trainings`도 동일 로직.
- `pg_cron`으로 5분 간격 실행. (메모리 안내에 따라 `cron.schedule`은 마이그레이션이 아닌 insert 도구로 실행)
- 보강: 클라이언트도 admin 화면 진입 시 한 번 RPC 호출(폴백). 사용자 사전신청 페이지에서는 “종료된 행사” 화면(이미 존재)을 **시간 기반**으로도 판정하도록 RPC `get_event_public_status(code)` 추가.

### 9) [P2] 모바일 사전신청/현장등록 UX 개선

- **스텝 폼 도입**: 1) 소속/기관 → 2) 부서/직급/성함 → 3) 이메일/연락처 → 4) (현장한정) 서명. 진행률 바 + “이전/다음” 버튼.
- 직급은 라디오 대신 **자유 입력 + 자주 쓰는 5개 칩(주무관/팀장/과장/부장/사무관)** 으로 변경.
- 서명 패드 사용성: 캔버스 높이 240px로 확대, “굵게/얇게” 토글 제거(과한 옵션), 모바일 가로 회전 시 자동 리사이즈 검증. 서명 영역 위에 “손가락으로 서명해주세요” 가이드.
- 필수/선택 시각 구분: 선택 필드는 라벨에 `(선택)` 회색 뱃지 추가, 필수는 빨간 ` *`.
- 연락처는 “휴대폰 뒷4자리만(현장 식별 보조)”로 선택 입력 가능하도록 라벨 명확화.

### 10) [P1] 사전신청 마감/종료 안내

- 8번에서 만든 `get_event_public_status(code)`가 다음을 반환:
  - `not_found` / `before_open` / `open` / `pre_reg_closed`(시작 N시간 전 마감) / `in_progress` / `closed`
- `RegisterPage`/`AttendancePage`/`TrainingRegisterPage`가 이 상태로 분기:
  - `pre_reg_closed`: “사전 신청은 마감되었습니다. 당일 현장 등록만 가능합니다.” + 현장 체크인 페이지 링크.
  - `in_progress`: 사전신청 페이지에서는 자동으로 현장 체크인 페이지로 리다이렉트 + 안내 토스트.
  - `closed`: 종료 안내 화면(이미 존재) 유지.
  - `full + waitlist 비활성`: 정원 마감 화면 유지(이미 존재).
- 사전신청 마감 시각은 `events`/`trainings`에 `pre_registration_close_at timestamptz NULL` 컬럼 추가(미설정 시 시작시각으로 간주). 관리자 생성/편집 폼에 입력 필드 추가.

---

## 구현 순서 (제안)

1. **P0 묶음**: RLS 잠금(5) + 정원 RPC 보강(3) + 이메일 정규화/중복(1)
2. **P1 묶음 A**: 상태 자동화(8) + 마감 안내(10) + 보조키(2)
3. **P1 묶음 B**: 키오스크 세션(6) + 내보내기 감사(7) + 서명 정책(4)
4. **P2**: 모바일 UX 스텝 폼(9)

각 단계 끝에 회귀 테스트(사전신청→중복→walk-in→체크인 일괄 시나리오)를 수동/자동으로 확인합니다.

---

## 기술 변경 요약 (개발자용)

- **마이그레이션**:
  - `normalize_email(text)` 함수 추가, 모든 등록/체크인 RPC가 사용
  - `lookup_code` 컬럼 + 발급 로직, `(event_id, lookup_code)` 유니크
  - `pre_registration_close_at` 컬럼 추가
  - `attendees`/`trainees` INSERT 공개 정책 제거, RPC `EXECUTE` 권한 부여
  - `auto_transition_event_statuses()`, `get_event_public_status(code)`, `purge_expired_signatures()`, `lookup_attendee()` 등 신규
  - `idx_trainees_unique_active`(이름+소속) 드롭 검토
  - `export_audit_logs` 테이블 + RLS
- **insert(데이터) 작업**: `pg_cron` 스케줄 등록 (5분 주기 상태 전환, 일 1회 서명 만료 정리)
- **프론트**:
  - `RegisterPage`/`AttendancePage`/`TrainingRegisterPage`: `get_event_public_status` 기반 분기, 통합 검색(이메일/코드), 스텝 폼
  - `AdminEventCheckin`/`AdminTrainingCheckin`: 키오스크 시작/종료 게이트, 자동 로그아웃 훅 `useKioskIdleLogout`
  - `AdminLayout`: 키오스크 모드일 때 메뉴 잠금
  - `lib/exportAttendees.ts`: 파일명 표준, 재인증 모달, 감사 로그 INSERT, 서명 포함 토글
  - `compressSignature.ts` 신설 후 모든 서명 캔버스에서 사용

---

## 결정 필요 사항(승인 시 함께 알려주세요)

1. **사전신청 마감 시각** 기본값: (a) 행사 시작 시각과 동일 / (b) 시작 1시간 전 / (c) 관리자가 매번 직접 입력
2. **서명 보관 기간**: 행사 종료 후 (a) 3개월 / (b) 6개월 / (c) 12개월
3. **내보내기 재인증 방식**: (a) 비밀번호 재입력 / (b) 이메일 OTP / (c) 둘 다 옵션
4. **키오스크 자동 로그아웃 시간**: (a) 10분 / (b) 15분 / (c) 30분
5. **보조 식별 코드**: (a) 6자리 숫자 / (b) 영문+숫자 8자리 / (c) 도입하지 않고 “이메일 + 이름+휴대폰 뒷4자리” 조합으로만 진행

승인해주시면 P0부터 순서대로 구현을 시작하겠습니다.
