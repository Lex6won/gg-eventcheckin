# 신청자/참석자 명부 탭을 상세 페이지에서도 바로 보이게

## 현재 상황 (스크린샷 분석)

스크린샷의 페이지는 행사 **상세 페이지** (`/admin/events/:id`)입니다. 여기에는:
- 위쪽: QR 2개 (사전 신청 / 참석 확인) — 정상
- 액션 버튼: `참석자 (0)` 버튼을 누르면 `/admin/events/:id/attendees` 로 이동
- 아래쪽: 옛날 방식 그대로인 인라인 "참석자 명부" 섹션 (탭 없음, 엑셀/PDF 버튼 1세트)

탭(신청자 명부 / 참석자 명부)은 **별도 페이지**(`/admin/events/:id/attendees`, `/admin/trainings/:id/trainees`)에 이미 구현되어 있지만, 사용자가 그 페이지로 이동하지 않으면 보이지 않습니다. 게다가 상세 페이지 하단의 옛날 "참석자 명부" 섹션은 탭 분리 정책과 충돌합니다 (전체 attendees를 한 덩어리로 보여주고 단일 export).

## 목표

상세 페이지에서 바로 신청자/참석자 두 명부를 탭으로 확인하고, 각각 따로 엑셀/PDF로 내려받을 수 있게 합니다.

## 변경 사항

### 1) `src/pages/AdminEventDetail.tsx`

기존 인라인 "참석자 명부" 섹션 (대략 425–500행)을 두 탭 프리뷰 카드로 교체합니다.

```text
┌─────────────────────────────────────────────────────────┐
│ [신청자 명부 (N)]  [참석자 명부 (M)]          [엑셀][PDF] │
├─────────────────────────────────────────────────────────┤
│ • 신청자 명부 탭: status in ('registered','checked_in') │
│   - 컬럼: 소속/이름/연락처/(차량)/사전신청 시각/참석여부 │
│   - 서명 컬럼 없음                                      │
│ • 참석자 명부 탭: signature_url 있는 사람               │
│   - 컬럼: 소속/이름/연락처/(차량)/체크인 시각/구분      │
│     (구분 = 사전신청/현장등록)                          │
│   - 서명 썸네일 포함                                    │
└─────────────────────────────────────────────────────────┘
```

엑셀/PDF 버튼은 **현재 활성 탭**을 기준으로 다운로드합니다 (이미 `/attendees` 페이지가 사용하는 `exportToExcel`/`exportToPDF`의 `mode: 'applicants' | 'attendees'` 분기 그대로 재사용).

상단 "참석 등록 완료 N명" 단일 카드는 4-카드 요약(사전 신청 / 참석 완료 / 현장 등록 / 미참석)으로 교체해 한 화면에서 흐름이 보이도록 합니다 — `/attendees` 페이지에서 쓰는 계산식(applicants / attendedList / walkInCount / noShowCount)을 그대로 가져옵니다.

`참석자 (N)` 액션 버튼은 **유지**합니다(전체 명부 페이지로 가는 진입점). 라벨만 `명부 전체보기`로 바꿔 의미를 명확히 합니다.

### 2) `src/pages/AdminTrainingDetail.tsx`

행사와 동일한 패턴을 교육에도 적용합니다 (462행 부근의 인라인 "참석자 명부" 섹션 교체, 4-카드 요약, 탭별 내보내기). 라벨은 교육 컨벤션에 맞춰 `신청자 명부` / `수강자 명부`로 표기합니다.

### 3) 데이터 / 타입

- 추가 쿼리 없음. 이미 두 페이지 모두 `attendees` (또는 `trainees`) 전체를 읽고 있으므로, 같은 배열에서 `useMemo`로 신청자/참석자 두 슬라이스를 만듭니다.
- `Attendee` 인터페이스에 `status` 필드가 누락되어 있다면 보강 (`'registered' | 'checked_in' | 'walk_in'`).

### 4) 손대지 않는 것

- 별도의 `/attendees`, `/trainees` 페이지: 그대로 유지 (검색·반응형 카드 뷰 등 풀 기능). 상세 페이지 카드는 "프리뷰 + 내려받기" 역할.
- QR 2개 섹션, 통계 다이얼로그, 키오스크 진입 버튼, 수정/삭제 — 변경 없음.
- 사전 신청 / 참석 확인 분리 로직, 서명 정책 (사전신청 서명 없음, 참석확인 서명 필수) — 변경 없음.

## 기술 세부 (개발자용)

- 탭 상태는 로컬 `useState<'applicants' | 'attendees'>('applicants')`.
- `applicants = attendees.filter(a => a.status === 'registered' || a.status === 'checked_in')`
- `attendedList = attendees.filter(a => !!a.signature_url)`
- `walkInCount = attendees.filter(a => a.status === 'walk_in').length`
- `noShowCount = attendees.filter(a => a.status === 'registered' && !a.signature_url).length`
- 엑셀/PDF 호출:
  - 신청자 탭: `exportToExcel(event, applicants, { mode: 'applicants', showCarNumber })`
  - 참석자 탭: `exportToExcel(event, attendedList, { mode: 'attendees', showCarNumber })`
  - `src/lib/exportAttendees.ts`는 이전 단계에서 이미 mode를 받도록 수정됨 — 시그니처만 재확인.
- 토스트 메시지에 탭 이름 포함 (예: `"신청자 명부 엑셀이 다운로드되었습니다."`).
- 빈 상태 카피를 탭별로 분기:
  - 신청자 탭: "아직 사전 신청한 인원이 없습니다."
  - 참석자 탭: "아직 참석 확인된 인원이 없습니다."

## 결과

상세 페이지 한 화면에서:
1. 사전 신청 QR / 참석 확인 QR 두 단계가 나란히 보이고
2. 바로 아래 4-카드 요약으로 진행 현황을 파악하고
3. 그 아래 탭으로 신청자 명부 ↔ 참석자 명부를 즉시 비교하며
4. 각 탭에서 따로 엑셀/PDF를 내려받을 수 있습니다.

별도 명부 페이지로 이동하지 않아도 사용자가 요구한 분리가 한 눈에 보입니다.
