## 최종 확정 계획

**한 줄 요약**: 입력은 "최초 1회"만, 그 후엔 **QR 한 번 = 끝**. 이메일/6자리 코드 입력 화면은 전면 제거.

---

## 두 가지 프로세스

```text
[프로세스 1] 사전신청자
사전신청 폼 (서명 X) → 토큰 발급/저장 → "신청 완료"
   ↓ (행사 당일 같은 폰)
QR 스캔 → 토큰 인식 → 바로 서명 → "참석확인 완료"
   ↓ (재확인 시점, 같은 폰)
QR 스캔 → 즉시 "참석 재확인 완료"

[프로세스 2] 미신청자 (당일 본인 폰)
QR 스캔 (토큰 없음) → 정보입력 + 서명 → 토큰 발급 → "참석확인 완료"
   ↓ (재확인 시점, 같은 폰)
QR 스캔 → 즉시 "참석 재확인 완료"
```

폰을 바꾼 경우: 폰B에서 같은 이메일로 현장 폼을 제출하면 **사전신청 레코드를 자동 업그레이드**(서명 저장 + confirmed + 폰B에 토큰 재발급).

---

## 화면 분기 (`/training/:code`, `/attend/:code`)

| phase | 토큰 | 참여 상태 | 화면 |
|-------|------|----------|------|
| open | 없음 | – | 사전신청 폼 (서명 없음) |
| open | 있음 | registered | "이미 신청하셨습니다" + 본인 정보 |
| in_progress | 있음 | registered | **서명 화면 직행** → "참석확인 완료" |
| in_progress | 있음 | confirmed/walk_in, 재확인 토글 ON, 미재확인 | **즉시 "재확인 완료"** |
| in_progress | 있음 | 위 + 재확인 완료 또는 토글 OFF | "모든 절차 완료" / "이미 참석확인됨" |
| in_progress | 없음 | – | 현장 참석확인 폼 (정보+서명) |
| closed, 종료 후 ≤ 30분 | 있음 | 미재확인 + 토글 ON | **즉시 "재확인 완료"** |
| closed (그 외) | – | – | 종료 안내 |

---

## 서명 / 토큰 시점

| 단계 | 토큰 | 서명 |
|------|------|------|
| 사전신청 | 발급 | ✗ |
| 최초 참석확인 (사전신청자) | 검증 | ✓ |
| 최초 참석확인 (현장) | 발급 | ✓ |
| 참석 재확인 (행사 종료 +30분까지) | 검증 | ✗ |

---

## 디바이스 토큰

- `attendees.device_token text unique`, `trainees.device_token text unique` (32바이트 base64url)
- `localStorage["device_token:event:<id>"]` / `device_token:training:<id>"` 에 저장
- QR 진입 시 토큰이 있으면 RPC에 함께 전송 → 본인 매칭

---

## DB 마이그레이션

```sql
-- 컬럼 추가
ALTER TABLE attendees
  ADD COLUMN device_token text UNIQUE,
  ADD COLUMN rechecked_at timestamptz;
ALTER TABLE trainees
  ADD COLUMN device_token text UNIQUE,
  ADD COLUMN rechecked_at timestamptz,
  ALTER COLUMN signature_url DROP NOT NULL;
ALTER TABLE events    ADD COLUMN recheck_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE trainings ADD COLUMN recheck_enabled boolean NOT NULL DEFAULT false;
```

**가드 함수 신규**: `_assert_event_open_for_recheck(p_event_id)` — 종료 시각 + 30분까지 허용, `recheck_enabled = true` 검사. 교육도 동일.

---

## RPC 변경

**수정**
- `register_attendee_pre`, `register_trainee`
  - `p_signature_url` 파라미터 제거, 서명 검증 제거
  - 토큰 발급 후 반환값에 `device_token` 포함

**신규**
- `device_checkin_attendee(p_event_id, p_device_token, p_signature_url)`
  - 토큰 매칭 → `registered`에서만 서명 저장 + `checked_in`
- `device_checkin_trainee(...)` 동일
- `walk_in_attendee_self(p_event_id, p_email, ..., p_signature_url, p_privacy_agreed)`
  - 같은 이메일의 사전신청(`registered`) 레코드 있으면 → 업그레이드 (`checked_in` + 서명 + 토큰 재발급)
  - 없으면 새 `walk_in` 레코드 + 토큰 발급
  - 반환값에 `device_token`
- `walk_in_trainee_self(...)` 동일
- `device_recheck_attendee(p_event_id, p_device_token)` / `device_recheck_trainee(...)`
  - `_assert_*_open_for_recheck` 통과 + 토큰 매칭 + `checked_in`/`confirmed`/`walk_in` + 미재확인 → `rechecked_at = now()`

**DROP**
- `checkin_attendee`, `checkin_trainee` (이메일/코드 입력 경로)
- `walk_in_attendee`, `walk_in_trainee` (관리자 키오스크용)
- `lookup_attendee`, `lookup_trainee` (검색 UI 제거)

---

## 프론트엔드 변경

**삭제**
- `src/pages/AdminEventCheckin.tsx`, `src/pages/AdminTrainingCheckin.tsx`
- `src/hooks/useKioskIdleLogout.ts`
- `App.tsx` 라우트 `/admin/events/:eventId/checkin`, `/admin/trainings/:trainingId/checkin`
- 이벤트/교육 카드·상세의 "현장 등록 모드" 진입 버튼

**수정**
- `RegisterPage.tsx`(사전신청): 서명 UI/로직 제거, 응답 토큰 localStorage 저장
- `TrainingRegisterPage.tsx` / `AttendancePage.tsx`:
  - phase × 토큰 자동 분기
  - 토큰 있음 + registered → 서명 화면 직행
  - 토큰 있음 + confirmed/walk_in + 토글 ON + 미재확인 → 자동 재확인 호출 + 완료 화면
  - 토큰 없음 + in_progress → 현장 참석확인 폼 (정보+서명)
  - 이메일/6자리 코드 입력 UI 완전 제거
  - 폼 제출 응답의 `device_token` localStorage 저장
- `CreateEventDialog.tsx` / `CreateTrainingDialog.tsx`: "참석 재확인 받기" 토글 추가
- 참석자 목록/상세(`AdminEventAttendees`, `AdminTrainingTrainees`, `AdminAttendees`): "재확인 시각" 컬럼 + 통계 카드
- `exportAttendees.ts`: "재확인 시각" 1열 추가

---

## 보안 / 검토

- 토큰은 32바이트 임의값, 단독으로 참석확인 불가(서명 단계 별도)
- 재확인은 토큰만으로 가능하지만 이미 서명한 사람만 대상 + 종료 +30분 한정 → 피해 표면 작음
- 사전신청자 자동 업그레이드는 같은 이메일 + 본인 폰 입력 → 본인 확인 수준 충분
- 모든 새 RPC는 SECURITY DEFINER, 서명 받는 RPC는 길이 200,000 제한 유지

---

## 작업 순서

1. DB 마이그레이션 (컬럼 + 가드 함수 + RPC 신규/수정/DROP)
2. 사전신청·참석 페이지 리팩토링 (서명/이메일 입력 제거, 토큰 흐름)
3. 관리자 키오스크 페이지/라우트/진입 버튼 제거
4. 생성 다이얼로그 재확인 토글 추가
5. 참석자 목록·통계·Export에 재확인 시각 반영
6. README/도움말 문구 정리

승인하시면 마이그레이션부터 실행합니다.
