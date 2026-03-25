

## Plan: 부서별 관리자 권한 분리 및 전체 관리자 설정

### 현재 상태
- 관리자 계정은 gg0018@gg.go.kr 1개만 존재
- 모든 행사/참석자 데이터를 제한 없이 조회 가능
- 관리자 회원가입 기능 없음

### 변경 목표
1. **부서별 관리자 계정** 생성 가능 (회원가입 추가)
2. **gg0018@gg.go.kr** → 전체 관리자(super_admin)
3. **일반 관리자** → 자기가 만든 행사만 관리/조회
4. **전체 관리자** → 모든 행사/참석자 조회 가능

---

### 기술 변경 사항

**1. DB 마이그레이션**
- `user_roles` 테이블 생성 (app_role enum: `super_admin`, `admin`)
- `has_role()` security definer 함수 생성
- gg0018@gg.go.kr 계정에 `super_admin` 역할 부여 (INSERT)
- 신규 가입 시 자동으로 `admin` 역할 부여하는 트리거 생성
- events SELECT RLS를 `created_by = auth.uid() OR has_role(super_admin)`으로 변경
- attendees SELECT RLS도 동일하게 변경 (자기 행사 참석자만 or 전체관리자)

**2. 관리자 회원가입 기능 추가 (`AdminLogin.tsx`)**
- 로그인 화면에 "회원가입" 탭/토글 추가
- 이메일 + 비밀번호로 가입 (부서명 입력 필드 추가 → profiles 테이블에 저장)
- profiles 테이블 생성 (user_id, department, created_at)

**3. Auth Context 확장 (`lib/auth.tsx`)**
- `isSuperAdmin` 상태 추가: user_roles 테이블에서 역할 조회
- `signUp` 함수 추가

**4. 행사 목록 필터링 (`AdminEvents.tsx`)**
- 전체 관리자: 모든 행사 조회 (현재 그대로)
- 일반 관리자: `created_by = user.id` 필터 추가

**5. 참석자 현황 필터링 (`AdminAttendees.tsx`)**
- 전체 관리자: 전체 참석자
- 일반 관리자: 자기 행사의 참석자만

**6. 설정 페이지 (`AdminSettings.tsx`)**
- 전체 관리자에게만 전체 관리자 목록 표시
- 역할 표시 (전체 관리자 / 부서 관리자)

**7. 사이드바/헤더**
- 역할에 따라 "전체 관리자" 또는 부서명 표시

