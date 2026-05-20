## 분석 결과

관리자 화면이 깜빡이고 끊기는 주된 원인은 3가지입니다.

### 1. 인증/권한 조회가 중복 실행됨
`AuthProvider`에서 로그인 세션을 확인하는 흐름이 `onAuthStateChange`와 `getSession()` 양쪽에서 동시에 실행되고 있습니다.

현재 브라우저 네트워크 기록에서도 관리자 화면 진입 직후 다음 요청이 3세트 반복됩니다.

```text
user_roles 조회 3회
profiles 조회 3회
각 요청 1.0초 ~ 2.0초 소요
```

이때 `roleLoading`이 여러 번 `true/false`로 바뀌고, `AdminLayout`은 `roleLoading=true`일 때 전체 관리자 화면을 스피너로 교체합니다. 그래서 화면 전체가 잠깐 사라졌다가 다시 나타나는 깜빡임이 발생합니다.

### 2. 권한 확정 전 데이터 목록을 먼저 가져옴
`AdminEvents`, `AdminTrainings`, `AdminAttendees`가 `isSuperAdmin`이 아직 확정되기 전에 데이터를 조회합니다.

초기값은 `isSuperAdmin=false`라서 처음에는 부서관리자 기준으로 조회했다가, 전체관리자 권한이 확인되면 다시 전체 목록으로 재조회합니다.

결과적으로:

```text
로딩 → 일부 목록 표시 → 권한 확인 → 전체 목록 재조회 → 화면 갱신
```

이 흐름이 깜빡임처럼 보입니다.

### 3. 관리자 앱이 처음부터 무거운 라이브러리를 한꺼번에 로드함
현재 `App.tsx`가 모든 관리자 페이지를 정적 import하고 있습니다. 그래서 `/admin/trainings` 목록만 볼 때도 상세 페이지에서만 필요한 무거운 라이브러리가 같이 로드됩니다.

성능 측정 결과 초기 로드에 큰 영향을 주는 파일:

```text
exceljs      약 289KB, 1.65초
recharts     약 214KB, 1.70초
jspdf        약 165KB, 1.53초
lucide-react 약 157KB, 1.44초
```

측정된 초기 렌더링도 느립니다.

```text
First Contentful Paint: 약 7.5초
DOM Content Loaded: 약 7.4초
```

즉, 깜빡임은 인증 상태 중복 갱신 문제이고, 끊김/느림은 초기 번들 과다 로드와 목록 조회 방식이 함께 만든 현상입니다.

## 수정 계획

### 1. 인증/권한 로딩 안정화
`src/lib/auth.tsx`를 정리합니다.

- 세션 처리 함수를 하나로 통합
- 같은 사용자에 대한 `user_roles`, `profiles` 중복 조회 방지
- 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않도록 요청 순서 가드 추가
- 이미 권한 정보가 확정된 상태에서는 `roleLoading` 때문에 관리자 레이아웃 전체가 다시 스피너로 바뀌지 않게 조정

### 2. 관리자 레이아웃 깜빡임 제거
`src/components/AdminLayout.tsx`를 조정합니다.

- 최초 인증/권한 확인 때만 전체 화면 로딩 표시
- 권한 정보가 이미 있는 상태의 재검증은 화면 전체를 언마운트하지 않음
- 승인 대기 화면으로 잘못 순간 이동하는 현상 방지

### 3. 관리자 목록 화면의 중복 조회 방지
다음 화면에서 권한 확정 후에만 데이터를 조회하도록 수정합니다.

- `src/pages/AdminEvents.tsx`
- `src/pages/AdminTrainings.tsx`
- `src/pages/AdminAttendees.tsx`
- 필요 시 `src/pages/AdminSettings.tsx`

특히 전체관리자는 `isSuperAdmin=false` 초기값으로 먼저 조회하지 않도록 막습니다.

### 4. 목록 카운트 조회 최적화
`AdminEvents`, `AdminTrainings`의 N+1 조회를 줄입니다.

현재 구조:

```text
교육 목록 1회 조회
교육별 confirmed count 조회
교육별 waitlisted count 조회
```

교육/행사가 늘어나면 요청 수가 급증합니다.

개선 구조:

```text
목록 1회 조회
관련 참석자/교육생 상태 1회 조회
프론트에서 training_id/event_id별 count 집계
```

이렇게 하면 목록 화면에서 체감 끊김이 줄어듭니다.

### 5. 무거운 페이지/라이브러리 지연 로딩
`src/App.tsx`를 React lazy loading 구조로 바꿉니다.

- 현재 들어온 관리자 화면에 필요한 페이지만 로드
- 상세/통계/엑셀/PDF 관련 라이브러리는 해당 기능을 열거나 다운로드할 때만 로드
- `/admin/trainings` 목록 진입 시 `exceljs`, `jspdf`, `recharts`가 즉시 로드되지 않도록 분리

### 6. 검증
수정 후 다음을 확인합니다.

- 관리자 화면 진입 시 `user_roles`, `profiles` 요청이 1세트만 발생하는지
- 전체관리자 계정에서 목록이 “일부 → 전체”로 바뀌며 깜빡이지 않는지
- `/admin/trainings` 초기 진입 시간이 줄었는지
- 교육 생성/수정 후 목록으로 돌아올 때 화면 전체가 끊기지 않는지