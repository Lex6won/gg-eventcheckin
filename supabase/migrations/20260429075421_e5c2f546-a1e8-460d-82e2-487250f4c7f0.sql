
-- ============ ATTENDEES ============
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'walk_in',
  ADD COLUMN IF NOT EXISTS registered_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.attendees
  ALTER COLUMN signature_url DROP NOT NULL;

-- 기존 데이터는 walk_in 상태 유지 (default로 이미 처리됨, 명시적 백필)
UPDATE public.attendees SET status = 'walk_in' WHERE status IS NULL;

-- 중복 사전 신청 방지 (cancelled 제외)
CREATE UNIQUE INDEX IF NOT EXISTS attendees_event_email_unique
  ON public.attendees (event_id, lower(email))
  WHERE email IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS attendees_event_status_idx
  ON public.attendees (event_id, status);

-- ============ TRAINEES ============
ALTER TABLE public.trainees
  ADD COLUMN IF NOT EXISTS email text;

-- 기존 trainees 상태 매핑: confirmed → walk_in (서명까지 완료된 기존 데이터)
UPDATE public.trainees SET status = 'walk_in'
  WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
    AND email IS NULL; -- 신규 데이터는 건드리지 않음

-- 중복 신청 방지
CREATE UNIQUE INDEX IF NOT EXISTS trainees_training_email_unique
  ON public.trainees (training_id, lower(email))
  WHERE email IS NOT NULL AND status <> 'cancelled';

-- ============ RPC: 행사 사전 신청 ============
CREATE OR REPLACE FUNCTION public.register_attendee_pre(
  p_event_id uuid,
  p_email text,
  p_org_type text,
  p_organization text,
  p_department text,
  p_position text,
  p_name text,
  p_phone text,
  p_car_number text,
  p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event events%ROWTYPE;
  v_id uuid;
  v_existing uuid;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status = '완료' THEN RAISE EXCEPTION 'Event closed'; END IF;

  SELECT id INTO v_existing FROM attendees
   WHERE event_id = p_event_id
     AND lower(email) = lower(trim(p_email))
     AND status <> 'cancelled'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  INSERT INTO attendees (
    event_id, email, org_type, organization, department, position, name,
    phone, car_number, privacy_agreed, status, registered_at, signature_url
  ) VALUES (
    p_event_id, lower(trim(p_email)), p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_phone,''), NULLIF(p_car_number,''),
    p_privacy_agreed, 'registered', now(), NULL
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'registered', 'id', v_id);
END;
$$;

-- ============ RPC: 행사 현장 체크인 (사전 신청자) ============
CREATE OR REPLACE FUNCTION public.checkin_attendee(
  p_event_id uuid,
  p_email text,
  p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_attendee attendees%ROWTYPE;
BEGIN
  SELECT * INTO v_attendee FROM attendees
   WHERE event_id = p_event_id
     AND lower(email) = lower(trim(p_email))
     AND status <> 'cancelled'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_attendee.status = 'checked_in' OR v_attendee.status = 'walk_in' THEN
    RETURN jsonb_build_object('status', 'already',
      'attendee', jsonb_build_object('name', v_attendee.name, 'organization', v_attendee.organization));
  END IF;

  UPDATE attendees
     SET status = 'checked_in',
         signature_url = p_signature_url,
         checked_in_at = now()
   WHERE id = v_attendee.id;

  RETURN jsonb_build_object('status', 'checked_in',
    'attendee', jsonb_build_object('name', v_attendee.name, 'organization', v_attendee.organization));
END;
$$;

-- ============ RPC: 행사 현장 등록 (사전 신청 없음) ============
CREATE OR REPLACE FUNCTION public.walk_in_attendee(
  p_event_id uuid,
  p_email text,
  p_org_type text,
  p_organization text,
  p_department text,
  p_position text,
  p_name text,
  p_phone text,
  p_car_number text,
  p_signature_url text,
  p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event events%ROWTYPE;
  v_id uuid;
  v_existing uuid;
  v_email text;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status = '완료' THEN RAISE EXCEPTION 'Event closed'; END IF;

  v_email := lower(trim(p_email));

  SELECT id INTO v_existing FROM attendees
   WHERE event_id = p_event_id
     AND lower(email) = v_email
     AND status <> 'cancelled'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  INSERT INTO attendees (
    event_id, email, org_type, organization, department, position, name,
    phone, car_number, privacy_agreed, status, signature_url,
    registered_at, checked_in_at
  ) VALUES (
    p_event_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_phone,''), NULLIF(p_car_number,''),
    p_privacy_agreed, 'walk_in', p_signature_url,
    now(), now()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'walk_in', 'id', v_id);
END;
$$;

-- ============ RPC: 교육 사전 신청 (기존 register_trainee 갱신) ============
CREATE OR REPLACE FUNCTION public.register_trainee(
  p_training_id uuid,
  p_org_type text,
  p_organization text,
  p_department text,
  p_position text,
  p_name text,
  p_car_number text,
  p_inquiry text,
  p_signature_url text,
  p_privacy_agreed boolean,
  p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_training trainings%ROWTYPE;
  v_confirmed_count integer;
  v_status text;
  v_position integer;
  v_id uuid;
  v_existing_id uuid;
  v_email text;
BEGIN
  SELECT * INTO v_training FROM trainings WHERE id = p_training_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training not found'; END IF;
  IF v_training.status = '완료' THEN RAISE EXCEPTION 'Training closed'; END IF;

  v_email := lower(trim(p_email));

  -- 이메일이 있으면 이메일 기준, 없으면 기존(이름+소속) 기준 중복 검사
  IF v_email IS NOT NULL AND v_email <> '' THEN
    SELECT id INTO v_existing_id FROM trainees
     WHERE training_id = p_training_id
       AND lower(email) = v_email
       AND status <> 'cancelled' LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id FROM trainees
     WHERE training_id = p_training_id
       AND lower(name) = lower(p_name)
       AND lower(organization) = lower(p_organization)
       AND status <> 'cancelled' LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_training.capacity_enabled AND v_training.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_confirmed_count
      FROM trainees WHERE training_id = p_training_id
        AND status IN ('confirmed','registered','walk_in');
    IF v_confirmed_count < v_training.capacity THEN
      v_status := 'registered';
    ELSIF v_training.allow_waitlist THEN
      v_status := 'waitlisted';
    ELSE
      RETURN jsonb_build_object('status', 'full');
    END IF;
  ELSE
    v_status := 'registered';
  END IF;

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at
  ) VALUES (
    p_training_id, NULLIF(v_email,''), p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    p_signature_url, p_privacy_agreed, v_status, NULL
  )
  RETURNING id INTO v_id;

  IF v_status = 'waitlisted' THEN
    SELECT count(*) INTO v_position
      FROM trainees
     WHERE training_id = p_training_id AND status = 'waitlisted'
       AND registered_at <= (SELECT registered_at FROM trainees WHERE id = v_id);
  END IF;

  RETURN jsonb_build_object('status', v_status, 'id', v_id, 'position', v_position);
END;
$$;

-- ============ RPC: 교육 현장 체크인 ============
CREATE OR REPLACE FUNCTION public.checkin_trainee(
  p_training_id uuid,
  p_email text,
  p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t trainees%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM trainees
   WHERE training_id = p_training_id
     AND lower(email) = lower(trim(p_email))
     AND status <> 'cancelled' LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;

  IF v_t.status IN ('confirmed','walk_in') THEN
    RETURN jsonb_build_object('status','already',
      'trainee', jsonb_build_object('name', v_t.name, 'organization', v_t.organization));
  END IF;

  UPDATE trainees
     SET status = 'confirmed',
         signature_url = p_signature_url,
         confirmed_at = now()
   WHERE id = v_t.id;

  RETURN jsonb_build_object('status','checked_in',
    'trainee', jsonb_build_object('name', v_t.name, 'organization', v_t.organization),
    'was_waitlisted', v_t.status = 'waitlisted');
END;
$$;

-- ============ RPC: 교육 현장 등록 ============
CREATE OR REPLACE FUNCTION public.walk_in_trainee(
  p_training_id uuid,
  p_email text,
  p_org_type text,
  p_organization text,
  p_department text,
  p_position text,
  p_name text,
  p_car_number text,
  p_inquiry text,
  p_signature_url text,
  p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_training trainings%ROWTYPE;
  v_id uuid;
  v_existing uuid;
  v_email text;
BEGIN
  SELECT * INTO v_training FROM trainings WHERE id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training not found'; END IF;
  IF v_training.status = '완료' THEN RAISE EXCEPTION 'Training closed'; END IF;

  v_email := lower(trim(p_email));

  SELECT id INTO v_existing FROM trainees
   WHERE training_id = p_training_id
     AND lower(email) = v_email
     AND status <> 'cancelled' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at
  ) VALUES (
    p_training_id, NULLIF(v_email,''), p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    p_signature_url, p_privacy_agreed, 'walk_in', now()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status','walk_in','id', v_id);
END;
$$;
