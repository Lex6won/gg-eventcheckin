

## 행사 포스터 업로드 기능 추가 및 폼 일관성 개선

### 문제점
- 포스터 이미지를 업로드/표시하는 기능이 전혀 없음 (DB 컬럼, 스토리지 버킷, UI 모두 부재)
- 세부 내용의 "포스터" 버튼은 QR 포스터 PDF 다운로드 기능으로, 이름이 혼동을 줄 수 있음

### 구현 계획

**1. DB 마이그레이션**
- `events` 테이블에 `poster_url` (text, nullable) 컬럼 추가
- Storage 버킷 `event-posters` 생성 (public)
- 버킷 RLS: 누구나 조회 가능, 인증된 사용자만 업로드/삭제

**2. 행사 생성 다이얼로그 (CreateEventDialog.tsx)**
- 포스터 이미지 업로드 필드 추가 (파일 선택 + 미리보기)
- 업로드 시 Storage에 저장 후 `poster_url`을 events 테이블에 기록

**3. 행사 수정 다이얼로그 (AdminEventDetail.tsx 내 Edit Dialog)**
- 동일한 포스터 업로드/변경 필드 추가
- 기존 포스터가 있으면 미리보기 표시 + 삭제/변경 가능

**4. 행사 세부 내용 표시 (AdminEventDetail.tsx)**
- 포스터 이미지가 있으면 행사 정보 카드에 썸네일 표시
- 클릭 시 원본 이미지 확대 보기
- 기존 "포스터" 버튼 → "QR 포스터" 로 라벨 변경하여 혼동 방지

**5. 참석 등록 페이지 (AttendancePage.tsx)**
- 행사 포스터가 있으면 상단에 표시하여 참석자가 행사를 시각적으로 확인 가능

### 파일 변경 목록
- `supabase/migrations/` — 새 마이그레이션 (poster_url 컬럼 + storage 버킷)
- `src/components/CreateEventDialog.tsx` — 포스터 업로드 필드 추가
- `src/pages/AdminEventDetail.tsx` — 포스터 표시 + 수정 폼에 업로드 추가 + "QR 포스터" 라벨 변경
- `src/pages/AttendancePage.tsx` — 포스터 이미지 표시

