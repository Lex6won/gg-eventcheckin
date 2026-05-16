# 부서관리자 승인 & 관리자 계정 관리

## 목표
1. 부서관리자가 가입하면 **즉시 사용 불가** → 전체관리자(super_admin)의 **승인** 이후에만 접근 허용
2. 전체관리자가 관리자 목록에서 **승인 / 회수 / 권한 승급·강등 / 삭제** 가능
3. 부서관리자는 **본인이 등록한 행사·교육·참석자만** 조회·수정·삭제 가능
4. 전체 RLS / 라우팅 / 화면 접근 권한 재점검

---

## 1. 가입·승인 흐름 변경

### 현재
- 가입 시 트리거 `handle_new_user_role`가 **자동으로 'admin' 역할 부여** → 이메일 인증만 끝나면 바로 모든 부서관리자 화면 사용 가능 (승인 절차 없음)

### 변경 후
- 가입 시 `profiles`만 생성, `user_roles` insert는 **하지 않음**
- 가입 직후 상태: 로그인 가능하지만 어떤 역할도 없음 → "승인 대기 중" 안내 화면만 노출
- 전체관리자가 승인하면 `user_roles`에 'admin' row 추가 → 정상 사용

---

## 2. DB 변경 (마이그레이션)

### profiles 컬럼 추가
- `approval_status text not null default 'pending'` ('pending' | 'approved' | 'rejected')
- `approved_at timestamptz`, `approved_by uuid`
- `rejected_reason text`

### 트리거 변경
- `handle_new_user_role` **제거** (자동 admin 부여 중단)
- `handle_new_user_profile`는 유지 (profile 자동 생성)

### 신규 RPC (모두 SECURITY DEFINER + super_admin 권한 체크)
- `list_admin_users()` → 모든 사용자: email(auth.users 조인), department, approval_status, role, created_at, approved_at
- `approve_admin(p_user_id uuid)` → profiles.approval_status='approved' + user_roles에 'admin' 삽입
- `reject_admin(p_user_id uuid, p_reason text)` → approval_status='rejected'
- `revoke_admin(p_user_id uuid)` → user_roles에서 'admin' 제거, approval_status='pending'으로 복원(또는 'rejected')
- `promote_super_admin(p_user_id uuid)` / `demote_super_admin(p_user_id uuid)` (마지막 super_admin 보호)
- `delete_admin_user(p_user_id uuid)` → auth.users 삭제(CASCADE로 profiles/user_roles/본인 데이터 정리)
  - 본인이 만든 events/trainings는 삭제 전 확인 필요 → 우선 차단(데이터 있으면 거부) 또는 super_admin에게 이관 선택지 제공

### 데이터 마이그레이션
- 기존에 'admin' 역할 보유한 사용자는 `approval_status='approved'`로 백필 (서비스 중단 방지)

---

## 3. 인증 컨텍스트 (`src/lib/auth.tsx`)
- `approvalStatus: 'pending' | 'approved' | 'rejected' | null` 추가
- `isAdmin` (admin 역할 보유) 노출
- 가입 직후 토스트 문구: "가입 신청이 접수되었습니다. 전체관리자 승인 후 사용 가능합니다."

## 4. 라우팅·접근 권한 (`AdminLayout` / `App.tsx`)
- 미로그인 → `/admin/login`
- 로그인 + 역할 없음 → **승인 대기 화면**(로그아웃 버튼만)
- 로그인 + role='admin' → 정상 화면, 단 `/admin/settings`의 관리자 목록 섹션 숨김
- 로그인 + role='super_admin' → 전체 접근

## 5. AdminSettings 개편
탭 또는 섹션 2개:
- **승인 대기** : pending 사용자 목록, [승인][거절] 버튼
- **활성 관리자** : approved 사용자 목록, 역할 뱃지, [권한변경][권한회수][삭제] 메뉴
- 본인 계정은 강등/삭제 비활성, 마지막 super_admin은 강등 차단

## 6. 권한 재점검 (변경 없이 확인 후 필요시 보완)
| 테이블 | SELECT | INSERT | UPDATE/DELETE | 비고 |
|---|---|---|---|---|
| events | public | created_by=auth.uid() | 본인 OR super_admin | QR 공개 페이지 위해 public select 유지 |
| trainings | public | 동일 | 동일 | 동일 |
| attendees | event 작성자 OR super_admin | RPC만 | 동일 | OK |
| trainees | training 작성자 OR super_admin | RPC만 | 동일 | OK |
| profiles | 본인 + super_admin | 본인 | 본인 | 신규 RPC가 super_admin 권한으로 수정 |
| user_roles | 본인 + super_admin | 없음 | 없음 | RPC만 변경 |
| export_audit_logs | 본인 + super_admin | 본인 | 없음 | OK |

추가 확인:
- 클라이언트의 `created_by` 필터는 UX용이며 실제 보안은 RLS가 담당 (admin 강등 시 즉시 차단됨)
- `events/trainings` public SELECT는 의도된 노출 (QR 페이지) — 변경 없음

---

## 기술 세부사항
- `delete_admin_user`는 `auth.admin.deleteUser` 호출 대신 SQL로 `delete from auth.users where id = p_user_id` (security definer로 가능)
- 마지막 super_admin 보호: `count(*) where role='super_admin'` ≥ 2 일 때만 강등/삭제 허용
- 신규 RPC들은 모두 시작 부분에 `if not has_role(auth.uid(), 'super_admin') then raise exception 'Forbidden'; end if;`

## 파일 변경 예정
- (신규) `supabase/migrations/...sql`
- `src/lib/auth.tsx` — approvalStatus/isAdmin 노출
- `src/App.tsx` 또는 `src/components/AdminLayout.tsx` — 승인 대기 게이트
- (신규) `src/pages/AdminPendingApproval.tsx`
- `src/pages/AdminSettings.tsx` — 승인/관리 UI 전면 개편
- `src/pages/AdminLogin.tsx` — 안내 문구 변경
