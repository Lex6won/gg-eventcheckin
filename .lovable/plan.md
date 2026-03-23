

## Plan: 연락처(phone) → 이메일(email, 선택사항) 변경

### 변경 요약
현재 필수 입력인 **연락처(phone)** 필드를 제거하고, **이메일(email)** 필드를 비필수(선택) 사항으로 추가합니다.

### 주의사항
현재 **중복 등록 방지**가 연락처(phone) 기준으로 동작합니다. 연락처를 제거하면 중복 체크 기준이 사라지므로, **이름(name) + 소속(organization)** 조합으로 중복 판단하도록 변경합니다.

---

### 변경 단계

**1. 데이터베이스 마이그레이션**
- `attendees` 테이블에 `email text` 컬럼 추가 (nullable)
- `phone` 컬럼을 nullable로 변경 (기존 데이터 보존)

**2. 참석 등록 폼 수정 (`AttendancePage.tsx`)**
- 연락처 입력 필드 제거, 이메일 입력 필드 추가 (선택사항, `*` 표시 없음)
- `formatPhone` 헬퍼 및 관련 핸들러 제거
- form state에서 `phone` → `email` 변경
- 유효성 검사에서 phone 필수 체크 제거, email은 입력 시 형식만 검증
- 중복 체크: phone 기준 → name + organization 기준으로 변경
- DB insert 시 `phone` 대신 `email` 전달

**3. 관리자 참석자 목록 페이지 수정**
- `AdminEventAttendees.tsx`, `AdminAttendees.tsx`, `AdminEventDetail.tsx`, `EventDetail.tsx`: 테이블 컬럼에서 연락처 → 이메일로 변경, 검색 대상도 email로 변경

**4. 엑셀/PDF 내보내기 수정 (`exportAttendees.ts`)**
- 헤더 및 데이터에서 연락처 → 이메일로 변경

**5. 타입 정의**
- 각 파일의 인터페이스에서 `phone` → `email` (optional) 변경
- `types.ts`는 마이그레이션 후 자동 갱신

