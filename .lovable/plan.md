# 승인 시스템 검토 결과

DB 스키마 / RPC / 라우팅을 점검했습니다. **치명적 버그는 없으나** 사용자 경험과 데이터 일관성에 영향을 주는 **3건의 명확한 문제**를 발견했습니다.

---

## 🔴 P1 — 가입 시 부서명이 저장되지 않음 (기존 버그)

### 현상
이메일 인증을 켠 상태에서 `signUp()`이 호출되면 Supabase는 `data.user`만 반환하고 **세션은 만들지 않습니다**. 이 상태에서 클라이언트가:

```ts
await supabase.from('profiles').upsert({ user_id, department });
```

를 실행하면 `auth.uid()`가 NULL이라 RLS의 `user_id = auth.uid()` INSERT/UPDATE 정책이 막아 **조용히 실패**합니다. 결과적으로:
- `handle_new_user_profile` 트리거가 만든 profile은 그대로 남고 (`approval_status='pending'`, `department=NULL`)
- 가입 폼에 입력한 부서명은 사라짐 → 전체관리자가 승인 화면에서 "부서 미설정"만 보게 됨

### 해결
가입 시 부서명을 `auth.signUp({ options: { data: { department } } })`로 전달하고, `handle_new_user_profile` 트리거에서 `NEW.raw_user_meta_data->>'department'`를 읽어 profile에 함께 INSERT하도록 변경.

---

## 🟡 P2 — 승인된 관리자가 1순간 "승인 대기" 화면을 본다 (race)

### 현상
`AuthProvider`의 흐름:
1. `getSession()` → 세션 즉시 셋 + `loading=false`
2. `fetchRoleAndProfile()`은 `setTimeout(0)`로 비동기 실행 → 직후 한 틱은 `isAdmin=false`

`AdminLayout`이 `loading=false && user && !hasAdminAccess` 조건이면 곧바로 `<AdminPendingApproval />`을 렌더 → 페이지 전환마다 또는 새로고침 직후 **승인 대기 화면이 깜빡**.

### 해결
`AuthProvider`에 `roleLoading` 상태 추가. `fetchRoleAndProfile` 시작 시 true, 끝나면 false. `AdminLayout`은 `loading || (user && roleLoading)`을 함께 체크.

---

## 🟡 P3 — "거절" 시 사유 입력 UI 없음

### 현상
`AdminSettings`의 거절 다이얼로그는 사유 입력 필드가 없어 항상 `p_reason=null`로 호출됨. DB에는 `rejected_reason` 컬럼이 있지만 절대 채워지지 않음.

### 해결
거절 다이얼로그를 별도 컴포넌트로 분리, `<Textarea>` 추가 후 `reject_admin(p_user_id, reason)` 호출.

---

## ✅ 검증 완료 — 문제 없음

- **유니크 제약**: `profiles.user_id`, `user_roles(user_id, role)` 모두 존재 → ON CONFLICT 정상 동작
- **RLS**: events/trainings/attendees/trainees 모두 `created_by` OR `super_admin` 기반 — 권한 회수 즉시 차단됨
- **RPC 권한 체크**: 모든 새 RPC 시작부에 `has_role(auth.uid(), 'super_admin')` 가드 + `Forbidden` 에러
- **마지막 super_admin 보호**: `demote_super_admin`, `delete_admin_user` 모두 `count(*) <= 1` 차단
- **본인 보호**: revoke/promote/demote/delete 모두 `p_user_id = auth.uid()` 차단 또는 UI에서 버튼 숨김
- **삭제 시 데이터 보호**: 등록한 events/trainings 있으면 `delete_admin_user` 거부
- **백필**: 기존 admin 보유자는 모두 `approved`로 백필 → 서비스 중단 없음
- **PendingApproval 게이트**: 미승인 사용자는 모든 `/admin/*` 라우트에서 차단됨

---

## 추가 권장 (선택)

- `revoke_admin`이 super_admin 역할은 건드리지 않음 → super_admin에게 "회수" 버튼이 노출되지 않도록 UI에서 이미 제한 중. 이중 보호로 RPC에서도 super_admin이면 에러 던지도록 하면 더 안전.
- `delete_admin_user`가 등록 데이터 있으면 차단하는데, 메시지에서 "행사/교육"만 언급. attendees/trainees는 자동으로 events/trainings에 묶이므로 OK.

---

## 적용 범위

수정 시 변경될 파일:
- (신규 마이그레이션) `handle_new_user_profile` 트리거에서 메타데이터 → department 자동 저장
- `src/lib/auth.tsx` — `roleLoading` 상태 + `signUp`에 `options.data.department` 전달, 클라이언트 upsert 제거
- `src/components/AdminLayout.tsx` — `roleLoading` 반영
- `src/pages/AdminSettings.tsx` — 거절 사유 입력 UI

진행해도 될까요?
