## 교육(Training) 등록 및 관리 기능 설계

행사(Events)와 분리된 **교육(Trainings)** 도메인을 신설하여, 정원 제한 + 대기자 명단 기능을 포함한 교육 신청·관리 시스템을 구축합니다.

---

### 1. 데이터베이스 (신규 테이블)

#### `trainings` 테이블 (교육 정보)
기존 `events`와 유사하되 교육 전용 필드 추가:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| title, description | text | 교육명, 설명 |
| event_date, start_time, end_time | date/time | 일정 |
| location, organizer | text | 장소, 주관 |
| instructor | text (nullable) | 강사명 (교육 전용) |
| access_code | text | 6자리 숫자 접속코드 |
| status | text | 예정/진행중/완료 |
| poster_url | text | 포스터 |
| show_car_number | boolean | 차량번호 수집 여부 |
| **capacity_enabled** | boolean | 정원 제한 사용 여부 (토글) |
| **capacity** | integer (nullable) | 정원 수 |
| **allow_waitlist** | boolean | 대기자 허용 여부 (default true) |
| created_by, created_at, updated_at | - | 메타 |

#### `trainees` 테이블 (교육 신청자)
기존 `attendees` 구조 + 대기자 상태 컬럼:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| training_id | uuid | FK → trainings |
| org_type, organization, department, position, name | text | 신청자 정보 |
| car_number, inquiry | text (nullable) | 선택 입력 |
| signature_url | text | 서명 이미지 |
| privacy_agreed | boolean | 동의 여부 |
| **status** | text | `confirmed`(확정) / `waitlisted`(대기) / `cancelled`(취소) |
| **registered_at** | timestamp | 신청 시각 (대기 순번 기준) |
| **confirmed_at** | timestamp (nullable) | 대기→확정 전환 시점 |
| created_at | timestamp | - |

UNIQUE 인덱스: `(training_id, name, organization)` (취소 제외) — 중복 신청 차단

#### RLS 정책 (`events`와 동일 패턴)
- `trainings`: 모두 SELECT 가능, 생성자/super_admin만 INSERT/UPDATE/DELETE
- `trainees`: 누구나 INSERT, 교육 생성자/super_admin만 SELECT/UPDATE/DELETE

#### 정원 검증 (서버 측)
DB 함수 `register_trainee(training_id, ...payload)`를 SECURITY DEFINER로 작성:
1. 트랜잭션 내에서 해당 교육의 `capacity_enabled`, `capacity`, `allow_waitlist` 조회
2. `confirmed` 신청자 수를 `count`
3. 정원 미만이면 `status='confirmed'`로 INSERT
4. 정원 초과 + `allow_waitlist=true`면 `status='waitlisted'`로 INSERT
5. 정원 초과 + 대기자 비허용이면 에러 반환
6. 반환값: `{ status: 'confirmed' | 'waitlisted', position?: number }`

→ 동시 요청 경쟁 조건(race condition) 방지를 위해 함수 내에서 `LOCK TABLE` 또는 `SELECT ... FOR UPDATE` 사용.

---

### 2. 라우팅 (신규)

```text
/training/:accessCode      → 교육 신청 페이지 (참석자용)
/admin/trainings           → 교육 목록 관리
/admin/trainings/:id       → 교육 상세/통계
/admin/trainings/:id/trainees → 신청자 명단 (확정/대기 분리 표시)
/admin/trainings/:id/qr    → QR 출력
```

---

### 3. 관리자 UI

#### `AdminLayout` 사이드바에 메뉴 추가
- 행사 관리 / **교육 관리** / 참석자 현황 / 설정

#### `AdminTrainings.tsx` (교육 목록)
- `AdminEvents.tsx`와 동일한 구조: 상태 필터, 카드 그리드, 복제, 새 교육
- 카드에 "신청 12 / 정원 30 (대기 3)" 형식으로 표시

#### `CreateTrainingDialog.tsx`
- 기존 `CreateEventDialog` 항목 + 다음 필드 추가:
  - **강사명** (선택)
  - **정원 제한 토글** (Switch)
    - ON 시 정원 수 입력 필드 노출 (number, min=1)
    - **대기자 허용** 체크박스 (default ON)
  - 토글 OFF면 정원/대기자 필드 비활성화

#### `AdminTrainingDetail.tsx`
- 기존 통계 + **정원 진행률 바** (확정/정원, 대기자 수)
- "대기자 → 확정 전환" 버튼 (자리가 났거나 정원 늘렸을 때)

#### `AdminTrainingTrainees.tsx`
- 탭: 확정 / 대기 / 취소
- 대기자 행에서 "확정", "취소" 액션
- 확정자에서 "취소" 액션 → 트리거로 가장 빠른 대기자 자동 승격(옵션) 또는 수동
- 엑셀/PDF 내보내기 (상태 컬럼 포함)

---

### 4. 신청자 UI (`/training/:accessCode`)

`AttendancePage.tsx` 기반으로 `TrainingRegisterPage.tsx` 신설:

- 상단에 **정원 현황 배지**: "정원 30명 중 18명 신청" 또는 "정원 마감 — 대기자 등록 가능"
- `capacity_enabled=true` AND `confirmed >= capacity`인 경우:
  - `allow_waitlist=true`: "현재 정원이 마감되어 대기자로 등록됩니다" 안내 후 진행
  - `allow_waitlist=false`: 폼 숨기고 "신청이 마감되었습니다" 표시
- 제출 시 `register_trainee` RPC 호출
- 완료 화면 분기:
  - `confirmed`: "신청이 완료되었습니다 ✓"
  - `waitlisted`: "대기자 N번으로 등록되었습니다. 자리가 나면 안내드립니다."
- 기존 패턴 유지: 추가신청 등록 / 확인(홈) 버튼, 서명, 개인정보 동의

---

### 5. 구현 순서

1. **DB 마이그레이션**: `trainings`, `trainees` 테이블 + RLS + `register_trainee` 함수 + 트리거(`updated_at`)
2. **라우팅 추가**: `App.tsx`에 4개 라우트 등록
3. **관리자 페이지**: `AdminTrainings`, `CreateTrainingDialog`, `AdminTrainingDetail`, `AdminTrainingTrainees`, `AdminTrainingQR`
4. **신청 페이지**: `TrainingRegisterPage` (정원/대기 로직 포함)
5. **사이드바 메뉴**: `AdminLayout`에 "교육 관리" 추가
6. **공유 유틸 재사용**: `exportAttendees.ts`, `qrExport.ts`, `getPublicUrl.ts` → 교육용으로 일반화 또는 복제

---

### 핵심 설계 포인트

- **데이터 분리**: 교육은 별도 테이블 → 향후 강사 평가, 수료증, 차수 관리 등 확장 용이
- **정원 검증은 서버에서**: 클라이언트만 체크 시 동시 신청으로 정원 초과 가능 → DB 함수로 원자적 처리
- **대기자 자동 승격은 수동(MVP)**: 자동화하면 알림이 필요해지므로, 우선 관리자가 승격 버튼으로 처리. 추후 알림 기능과 함께 자동화 검토.
- **UI/UX 일관성**: 행사 관리와 동일한 시각적 패턴 유지 (카드, 필터, 통계, 내보내기)

승인하시면 위 순서대로 구현을 시작하겠습니다.