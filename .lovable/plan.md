# 서명 사라짐 오류 원인 분석

## 핵심 원인

`AttendancePage.tsx`와 `TrainingRegisterPage.tsx`의 `resizeCanvas` 함수 안에 다음 코드가 있습니다.

```ts
const resizeCanvas = useCallback(() => {
  if (sigCanvas.current && sigContainerRef.current) {
    ...
    canvas.width = container.offsetWidth * ratio;
    canvas.height = 200 * ratio;
    ...
    sigCanvas.current.clear();   // ← 매 resize마다 서명을 지움
  }
}, []);

useEffect(() => {
  ...
  window.addEventListener('resize', resizeCanvas);
}, [step, event, resizeCanvas]);
```

즉 `window` 의 `resize` 이벤트가 발생할 때마다 캔버스 크기를 다시 잡고 **무조건 `clear()` 를 호출**합니다.

## 왜 "특정 스마트폰"에서만 발생하는가

모바일 브라우저(특히 iOS Safari, 삼성 인터넷, 일부 안드로이드 Chrome)는 **사용자가 스크롤 할 때 주소창/하단 툴바가 자동으로 숨겨지거나 나타납니다**. 이때 viewport 높이가 바뀌면서 `window`의 `resize` 이벤트가 발생합니다.

- 데스크톱: 스크롤해도 resize 이벤트 안 남 → 정상
- 일부 안드로이드/구형 모델: 주소창이 고정되어 있어 resize 이벤트 안 남 → 정상
- iOS Safari, 삼성 인터넷, 최신 Chrome on Android: 스크롤 시 resize 발생 → **서명 즉시 삭제**

또한 키보드가 닫힐 때, 화면 회전, 핀치 줌 시에도 동일하게 발생합니다. 사용자가 "확인" 버튼을 누르려고 화면을 살짝 움직이는 순간 주소창이 다시 내려오며 resize → clear 가 트리거됩니다.

## 부가 요인

1. `canvas.width/height` 를 다시 할당하는 것 자체가 캔버스를 비우는 동작입니다 (HTML5 canvas 표준). 따라서 `clear()` 를 빼더라도 width/height 재설정만으로 그림은 사라집니다.
2. `useEffect` 의존성에 `resizeCanvas` 가 들어가 있고 `step/event` 가 바뀔 때마다 핸들러를 재등록하지만, 이는 본 버그와는 무관합니다.
3. step 진입 시 `setTimeout(resizeCanvas, 100)` 으로 초기 1회 리사이즈하는 부분은 유지해도 문제 없습니다 (서명 그리기 전이므로).

## 수정 방향

핵심 원칙: **사용자가 그리기 시작한 이후에는 캔버스 크기를 다시 잡지 않는다.**

1. `resizeCanvas` 안에서 무조건 `clear()` 하지 않고, 다음과 같이 보호:
   - 이미 서명이 그려진 상태(`!sigCanvas.current.isEmpty()`)면 resize를 건너뛴다.
   - 또는 캔버스의 컨테이너 width 가 실제로 바뀌었을 때만 다시 잡는다 (높이 변화는 무시).
2. `window.addEventListener('resize', ...)` 를 그대로 두는 대신, `ResizeObserver` 로 컨테이너 width 변화만 감지하도록 변경. 모바일 주소창 표시/숨김은 width 를 바꾸지 않으므로 자연스럽게 무시됩니다.
3. 그래도 width 가 바뀌어 다시 그려야 한다면, 기존 서명을 `toDataURL` 로 저장 → resize 후 `fromDataURL` 로 복원해 사용자 입력을 보존.

## 적용 파일

- `src/pages/AttendancePage.tsx`
- `src/pages/TrainingRegisterPage.tsx`

(`RegisterPage.tsx` 는 SignatureCanvas 를 직접 사용하지 않고 `p_signature_url: ''` 로 빈 값만 보내므로 수정 대상 아님.)

## 기대 효과

- iOS Safari, 삼성 인터넷에서 스크롤/주소창 토글로 서명이 사라지는 현상 제거
- 화면 회전/키보드 토글 시에도 그린 서명 보존
- 데스크톱·태블릿 동작에는 영향 없음
