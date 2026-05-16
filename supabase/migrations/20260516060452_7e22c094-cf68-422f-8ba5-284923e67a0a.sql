
-- 1. profiles 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

-- 2. 기존 admin/super_admin 보유자는 approved 백필
UPDATE public.profiles p
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, now())
 WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id);

-- profile 없는 기존 사용자에게 profile 생성 + approved 처리
INSERT INTO public.profiles (user_id, approval_status, approved_at)
SELECT u.id, 'approved', now()
  FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- 3. 자동 admin 부여 트리거 제거
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_role();

-- 4. profile 자동 생성 트리거 보장
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 5. super_admin 전용 RPC들

-- 5-1. 목록
CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  department text,
  approval_status text,
  role text,
  created_at timestamptz,
  approved_at timestamptz,
  rejected_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    p.department,
    COALESCE(p.approval_status, 'pending') AS approval_status,
    COALESCE(
      (SELECT CASE WHEN bool_or(r.role = 'super_admin') THEN 'super_admin'
                   WHEN bool_or(r.role = 'admin') THEN 'admin'
                   ELSE NULL END
         FROM user_roles r WHERE r.user_id = u.id),
      'none'
    ) AS role,
    u.created_at,
    p.approved_at,
    p.rejected_reason
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

-- 5-2. 승인
CREATE OR REPLACE FUNCTION public.approve_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.profiles (user_id, approval_status, approved_at, approved_by)
  VALUES (p_user_id, 'approved', now(), auth.uid())
  ON CONFLICT (user_id)
  DO UPDATE SET approval_status = 'approved',
                approved_at = now(),
                approved_by = auth.uid(),
                rejected_reason = NULL;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- 5-3. 거절
CREATE OR REPLACE FUNCTION public.reject_admin(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET approval_status = 'rejected',
         rejected_reason = NULLIF(p_reason,''),
         approved_at = NULL,
         approved_by = NULL
   WHERE user_id = p_user_id;
  DELETE FROM public.user_roles
   WHERE user_id = p_user_id AND role = 'admin';
END;
$$;

-- 5-4. 권한 회수 (admin 역할만 제거, super_admin은 demote 사용)
CREATE OR REPLACE FUNCTION public.revoke_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify self' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = p_user_id AND role = 'admin';
  UPDATE public.profiles
     SET approval_status = 'pending',
         approved_at = NULL,
         approved_by = NULL
   WHERE user_id = p_user_id;
END;
$$;

-- 5-5. super_admin 승급
CREATE OR REPLACE FUNCTION public.promote_super_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.profiles (user_id, approval_status, approved_at, approved_by)
  VALUES (p_user_id, 'approved', now(), auth.uid())
  ON CONFLICT (user_id)
  DO UPDATE SET approval_status = 'approved',
                approved_at = COALESCE(public.profiles.approved_at, now()),
                approved_by = COALESCE(public.profiles.approved_by, auth.uid());
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- 5-6. super_admin 강등
CREATE OR REPLACE FUNCTION public.demote_super_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.user_roles WHERE role = 'super_admin';
  IF v_count <= 1 THEN
    RAISE EXCEPTION '최소 1명의 전체관리자가 필요합니다.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = p_user_id AND role = 'super_admin';
END;
$$;

-- 5-7. 계정 삭제
CREATE OR REPLACE FUNCTION public.delete_admin_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_events int; v_trainings int; v_super int;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인 계정은 삭제할 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 마지막 super_admin 보호
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role='super_admin') THEN
    SELECT count(*) INTO v_super FROM public.user_roles WHERE role='super_admin';
    IF v_super <= 1 THEN
      RAISE EXCEPTION '최소 1명의 전체관리자가 필요합니다.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*) INTO v_events FROM public.events WHERE created_by = p_user_id;
  SELECT count(*) INTO v_trainings FROM public.trainings WHERE created_by = p_user_id;
  IF v_events > 0 OR v_trainings > 0 THEN
    RAISE EXCEPTION '등록한 행사/교육이 있어 삭제할 수 없습니다. 먼저 데이터를 정리해주세요.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- 6. 본인 승인 상태 조회용 (RLS로 본인 profile은 이미 select 가능하므로 별도 RPC 불필요)
