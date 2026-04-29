## 설계: 사전 신청 + 현장 체크인 2단계 프로세스

### 1. 핵심 컨셉

```text
[기존]
참석자 → /attend/:code → 모든 정보 입력 + 서명 → 즉시 "참석"

[신규]
사전:  참석자 → /register/:code → 정보 입력 (서명 X) → "사전 신청됨"
현장:  참석자 → /attend/:code → 이메일 입력 → 매칭 → 서명만 → "참석 확정"
                              ↘ 매칭 실패 / 미신청 → 신규 등록 폼 (정보+서명) → "현장 등록 + 참석"
```

- **식별 키**: 이메일 (필수, 사전 신청 시 입력)
- **사전 신청**: 서명 제외, 그 외 현재 등록 폼과 동일
- **현장 모드 2종**:
  - 셀프 체크인: 참석자가 자기 폰으로 `/attend/:code` 접속
  - 키오스크: 관리자가 `/admin/events/:id/checkin` 접속, 연속 체크인용
- **교육 정원**: 사전 신청에만 적용 (현장 등록은 정원 무시하고 항상 확정)

### 2. 데이터 모델 변경

**행사 (`attendees`)**
- 신규 컬럼:
  - `email text` (식별 키, 인덱스)
  - `status text default 'registered'` — `registered`(사전) / `checked_in`(현장 확인) / `walk_in`(현장 등록 + 확인)
  - `registered_at timestamptz default now()` — 사전 신청 시각
  - `signature_url`을 **nullable**로 변경 (사전 신청 시 비어있음)
- `checked_in_at`은 그대로 유지 (현장 확인 시각)
- 유니크 제약: `(event_id, lower(email))` partial index — 같은 행사 중복 신청 방지

**교육 (`trainees`)**
- 신규 컬럼: `email text`
- 기존 `status` enum 확장: `registered`(사전, 미체크인) / `confirmed`(체크인됨) / `waitlisted` / `cancelled` / `walk_in`
- `confirmed_at`은 체크인 시각으로 의미 재정의

**RPC 신설/수정**
- `register_attendee_pre(event_id, …)` — 사전 신청, 서명 없이 INSERT (status='registered')
- `checkin_attendee(event_id, email, signature_url)` — 이메일로 row 찾아 status→'checked_in', signature_url, checked_in_at 채움. 없으면 0건 반환 → 호출자가 walk-in 폼 안내
- `walk_in_attendee(event_id, … 풀 정보 + signature)` — 신규 행 INSERT (status='walk_in')
- `register_trainee` — 기존 시그니처 유지하되 status를 `registered`로 시작, 정원 검사는 동일
- `checkin_trainee(training_id, email, signature_url)` — 사전 신청자를 confirmed로 전환 (정원 무시)
- `walk_in_trainee(training_id, …)` — 정원 무시하고 walk_in으로 INSERT

### 3. 라우팅 변경

| 경로 | 역할 |
|---|---|
| `/register/:code` | 사전 신청 페이지 (행사+교육 공용 진입, code로 분기) |
| `/attend/:code` | 현장 체크인 (이메일 입력 → 매칭 → 서명) |
| `/training/:code` | (기존 유지, 사전 신청으로 동작) |
| `/admin/events/:id/checkin` | 관리자 키오스크 모드 (연속 체크인) |
| `/admin/trainings/:id/checkin` | 동일 (교육) |

기존 `/attend/:code`로 들어오는 트래픽 호환을 위해 `/register/:code`와 동일 폼 + 상단에 "현장에서 오셨나요? 체크인하기" 링크를 같이 노출하는 것을 권장.

### 4. 화면 설계

**A. 사전 신청 페이지 `/register/:code`** (새 컴포넌트 `RegisterPage.tsx`)
- 현재 등록 폼과 동일 필드 + **이메일 필수** 추가
- 서명 영역 제거
- 제출 후 "사전 신청 완료" 화면 — 이메일 안내, 일시·장소 재확인, "내 신청 정보가 이메일로 발송되었습니다" 문구

**B. 현장 체크인 페이지 `/attend/:code`** (`AttendancePage.tsx` 재구성)
- 단계 1: 이메일 입력 + "확인" 버튼
- 단계 2-A (매칭 성공): 신청자 정보 표시 (성명/소속) + 서명 캔버스 → "체크인 완료"
- 단계 2-B (매칭 실패/미신청): "사전 신청 내역이 없네요. 현장 등록을 진행할까요?" + 풀 등록 폼 + 서명 → walk-in
- 이미 체크인된 이메일 재입력 시: "이미 체크인 완료" 안내

**C. 관리자 키오스크 모드 `/admin/events/:id/checkin`** (새 페이지)
- 행사 정보 헤더 + 큰 이메일 입력창
- 체크인 후 자동으로 입력창 클리어 + 다음 사람 대기 (연속 처리)
- 사이드 카운터: 사전 신청 N / 체크인 N / 현장 등록 N
- 음성/시각 피드백 (성공 toast)

**D. 관리자 상세 화면 보강**
- 카운트 카드: **사전 신청 / 체크인 / 현장 등록** 3개로 분리
- 명부 테이블에 `상태` 컬럼 추가 + 상태 필터 탭 (전체/체크인됨/미체크인/현장등록)
- 통계: 체크인율 차트 추가 (등록 대비 체크인 %)
- 엑셀/PDF 헤더에 "상태", "사전신청시각", "체크인시각" 컬럼 추가

### 5. 마이그레이션 전략 (기존 데이터 호환)

- 기존 `attendees`/`trainees` 데이터는 모두 `status = 'walk_in'`으로 분류 (이전 모델은 사실상 현장 등록 + 즉시 서명)
- `signature_url` NOT NULL → NULL 허용으로 완화
- 이메일 컬럼은 nullable로 추가 (legacy 데이터엔 null)
- RLS 정책 그대로 유지 (`Anyone can register attendance` INSERT 정책 그대로 → 사전·현장 모두 public)

### 6. 이메일 식별 보강 (사용자 답변 반영)

- 이메일 비교는 `lower(trim(email))` 정규화
- 현장 입력 시 동일 정규화 후 매칭
- 대소문자 무시, 앞뒤 공백 제거
- 중복 사전 신청은 RPC 내부에서 차단 (`{ status: 'duplicate' }` 반환)

### 7. 단계별 구현 순서

1. **DB 마이그레이션**: 컬럼 추가, 제약 완화, 기존 행 status 백필, 신규 RPC 4개
2. **`RegisterPage.tsx`** 신설 + `/register/:code` 라우트 (서명 제외, 이메일 필수)
3. **`AttendancePage.tsx`** 리팩터: 이메일 단계 → 분기 (매칭/walk-in) → 서명
4. **관리자 키오스크 페이지** 2개 신설 + 상세 화면에 진입 버튼 추가
5. **관리자 상세/명부**: 상태 컬럼·필터·카운트 카드 갱신
6. **엑셀/PDF 내보내기**: 상태·사전신청시각 컬럼 추가
7. **사전 신청 QR/링크**: 행사·교육 상세에서 "사전 신청 링크"와 "현장 체크인 링크" 둘 다 노출 (관리자가 상황에 맞게 배포)

### 8. 기술 세부

**필드 검증 (zod 사용 권장)**
```ts
const baseSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  organization: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(50),
  // ...
});
```

**RPC 시그니처 예시**
```sql
checkin_attendee(p_event_id uuid, p_email text, p_signature_url text)
returns jsonb -- { status: 'checked_in' | 'not_found' | 'already', attendee?: row }
```

**파일 변경 요약**
- 신규 마이그레이션 1개
- 신규 파일: `src/pages/RegisterPage.tsx`, `src/pages/AdminEventCheckin.tsx`, `src/pages/AdminTrainingCheckin.tsx`
- 수정: `src/App.tsx` (라우팅), `src/pages/AttendancePage.tsx` (전면 개편), `src/pages/TrainingRegisterPage.tsx` (서명 제거, 이메일 필수), `src/pages/AdminEventDetail.tsx` / `AdminTrainingDetail.tsx` (카운트·체크인 진입), `src/pages/AdminEventAttendees.tsx` / `AdminTrainingTrainees.tsx` (상태 컬럼·필터), `src/lib/exportAttendees.ts` (헤더 추가)

### 9. 결정 필요 사항 (구현 전 확인)

- 현장 체크인 시 **이메일 외 보조키**가 필요할까요? (예: 동명이인이 같은 회사 메일을 공용으로 쓰는 경우 → 보통은 이메일 unique로 충분)
- 사전 신청 완료 시 **확인 이메일 자동 발송**이 필요한지 (별도 작업, 도메인 설정·템플릿 필요)
- 마이그레이션 시 기존 데이터 `status` 값을 일괄 `walk_in`으로 백필해도 되는지
