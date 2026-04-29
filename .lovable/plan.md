## 분석 리포트: 행사 관리 vs 교육 관리 기능 비교

### 1. 현재 기능 비교표

| 기능 | 행사 관리 | 교육 관리 | 격차 |
|---|---|---|---|
| 상세 정보 화면 | AdminEventDetail | AdminTrainingDetail | 교육은 액션 버튼이 적음 |
| 정보 수정 (제목/일시/장소/포스터 등) | 풀 수정 다이얼로그 (`openEdit`) | 상태/정원/차량번호 토글만 가능 | **수정 다이얼로그 없음** |
| 포스터 업로드/표시/확대 | 지원 (`event-posters` 버킷) | DB 컬럼은 있으나 **UI 미구현** | **포스터 기능 없음** |
| 참석자/신청자 명부 화면 | AdminEventAttendees + 상세에 테이블 | AdminTrainingTrainees | 교육은 상세에 명부 테이블 없음 |
| 엑셀 다운로드 (서명 이미지 포함) | `exportToExcel` (참석확인부 양식) | **CSV만 지원** | **엑셀 미지원** |
| PDF 다운로드 (NotoSansKR + 서명) | `exportToPDF` | **없음** | **PDF 미지원** |
| 통계 다이얼로그 (Recharts) | 소속별 Bar / 시간대 Bar / Pie | **없음** | **통계 화면 없음** |
| 링크 복사 / QR 이미지 / QR 포스터 PDF | 3종 모두 지원 | 링크 복사, QR 화면만 | **QR 이미지/포스터 다운로드 없음** |
| 신청자 개별 수정 | (행사도 미지원) | 없음 | 양쪽 동일 |
| 신청자 삭제 (영구) | 지원 | **없음** (cancelled 상태만) | **하드 삭제 없음** |
| 실시간 카운트 카드 | 지원 | 진행률 바만 있음 | 시각적 카운트 카드 없음 |

### 2. 데이터 모델 차이로 인한 주의점

- `attendees`에는 `checked_in_at`이 시간순 등록 시각, `trainees`에는 `registered_at` + `confirmed_at`이 분리되어 있음 → 내보내기/통계의 "등록시간" 기준은 `confirmed_at ?? registered_at` 사용
- `trainees`에는 `status` (confirmed/waitlisted/cancelled)가 있어 내보내기 시 **상태 컬럼**과 **상태별 필터링**이 필요
- 정원 제한 활성화 시 통계에 "확정/대기/취소" 분포와 "정원 대비 충원율"이 의미 있음

### 3. 구현 계획

#### A. 공통 라이브러리 확장 (`src/lib/exportAttendees.ts`)
- 신규 함수 추가 (기존 함수는 그대로 유지):
  - `exportTraineesToExcel(training, trainees, opts)` — 행사 양식과 동일한 레이아웃, 헤더 라벨만 "교육명/강사" 등으로 조정, **상태 컬럼 추가**, 서명 이미지 임베드
  - `exportTraineesToPDF(training, trainees, opts)` — landscape A4, NotoSansKR 동일, 상태 컬럼 포함
- `Trainee`/`TrainingData` 인터페이스 정의, `showCarNumber`/`statusFilter` 옵션 지원

#### B. `AdminTrainingDetail.tsx` 보강
- **풀 수정 다이얼로그** 추가 (행사와 동일 패턴):
  - 제목/설명/일시/장소/주관/강사/포스터 업로드·삭제·확대(`event-posters` 버킷 재사용)
- **액션 버튼 행** 추가: 통계 / 링크 복사(이미 있음) / QR 전체화면(이미 있음) / **QR 이미지** / **QR 포스터 PDF** / 수정 / 삭제
- **실시간 카운트 카드** 추가 (확정/대기/취소 3개)
- **신청자 명부 테이블** 인라인 표시 + 엑셀/PDF 다운로드 버튼 (현재 활성 탭에 따라 또는 전체)
- **통계 다이얼로그** 추가 (Recharts):
  - 소속별 Bar (상위 8개)
  - 신청 시간대 Bar (30분 단위, `registered_at` 기준)
  - 상태 분포 Pie (확정/대기/취소)
  - 정원 충원율 진행 바 (정원 활성 시)

#### C. `AdminTrainingTrainees.tsx` 보강
- 기존 CSV 버튼을 **엑셀 / PDF / CSV** 3개 버튼으로 확장 (`exportTraineesToExcel`/`exportTraineesToPDF` 사용)
- 행 단위 **영구 삭제** 버튼 추가 (확인 다이얼로그) — 현재는 status='cancelled' 만 가능
- 검색·필터 후의 결과를 내보내도록 유지

#### D. QR 다운로드 재사용
- 기존 `src/lib/qrExport.ts`의 `downloadQRImage`/`downloadQRPoster`는 `event` 형태(title, event_date, location, access_code)를 받음 → training 객체를 동일 shape로 매핑해 그대로 호출

### 4. 기술 세부

**Export 함수 시그니처 (예정)**
```ts
exportTraineesToExcel(
  training: { title; event_date; start_time; end_time; location; organizer; instructor? },
  trainees: Trainee[],
  opts?: { showCarNumber?: boolean; includeStatus?: boolean }
)
```

**컬럼 (엑셀/PDF)**
```text
번호 | 상태 | 구분 | 기관명 | 부서 | 직급 | 성명 | [차량번호] | 서명 | 등록시각
```
상태 라벨: 확정/대기/취소 (한글), 등록시각은 `confirmed_at ?? registered_at`.

**파일 변경 요약**
- 수정: `src/lib/exportAttendees.ts` (함수 추가)
- 수정: `src/pages/AdminTrainingDetail.tsx` (수정 다이얼로그, 통계, QR 다운로드, 명부 테이블, 카운트 카드)
- 수정: `src/pages/AdminTrainingTrainees.tsx` (엑셀/PDF 버튼, 영구 삭제)

기존 행사 기능과 시각·UX를 일치시켜 사용자가 같은 멘탈 모델로 사용할 수 있도록 합니다.