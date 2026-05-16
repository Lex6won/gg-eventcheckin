
-- ============================================================
-- 1) Columns
-- ============================================================
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS device_token text,
  ADD COLUMN IF NOT EXISTS rechecked_at timestamptz;

ALTER TABLE public.trainees
  ADD COLUMN IF NOT EXISTS device_token text,
  ADD COLUMN IF NOT EXISTS rechecked_at timestamptz;

ALTER TABLE public.trainees ALTER COLUMN signature_url DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendees_device_token_uidx
  ON public.attendees(device_token) WHERE device_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trainees_device_token_uidx
  ON public.trainees(device_token) WHERE device_token IS NOT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recheck_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS recheck_enabled boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2) Helper: token generator
-- ============================================================
CREATE OR REPLACE FUNCTION public._gen_device_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  -- 32 bytes -> ~43 char base64
  v := encode(gen_random_bytes(32), 'base64');
  v := replace(replace(replace(v, '+', '-'), '/', '_'), '=', '');
  RETURN v;
END;
$$;

-- ============================================================
-- 3) Recheck-window guards (end_time + 30 min)
-- ============================================================
CREATE OR REPLACE FUNCTION public._assert_event_open_for_recheck(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_e events%ROWTYPE; v_end timestamptz;
BEGIN
  SELECT * INTO v_e FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_e.recheck_enabled THEN RAISE EXCEPTION 'Recheck disabled' USING ERRCODE = 'P0001'; END IF;
  v_end := (v_e.event_date || ' ' || v_e.end_time)::timestamptz;
  IF now() > v_end + interval '30 minutes' THEN
    RAISE EXCEPTION 'Recheck window closed' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_training_open_for_recheck(p_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t trainings%ROWTYPE; v_end timestamptz;
BEGIN
  SELECT * INTO v_t FROM trainings WHERE id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_t.recheck_enabled THEN RAISE EXCEPTION 'Recheck disabled' USING ERRCODE = 'P0001'; END IF;
  v_end := (v_t.event_date || ' ' || v_t.end_time)::timestamptz;
  IF now() > v_end + interval '30 minutes' THEN
    RAISE EXCEPTION 'Recheck window closed' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ============================================================
-- 4) Pre-registration RPCs — issue device_token (no signature)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_attendee_pre(
  p_event_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_phone text,
  p_car_number text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid; v_existing uuid; v_email text; v_code text; v_token text;
BEGIN
  PERFORM _assert_event_open_for_pre_reg(p_event_id);
  v_email := normalize_email(p_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'Email required' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_existing FROM attendees
   WHERE event_id = p_event_id AND normalize_email(email) = v_email AND status <> 'cancelled' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate'); END IF;

  v_code := gen_lookup_code_for_event(p_event_id);
  v_token := _gen_device_token();

  INSERT INTO attendees (
    event_id, email, org_type, organization, department, position, name,
    phone, car_number, privacy_agreed, status, registered_at, signature_url,
    lookup_code, device_token
  ) VALUES (
    p_event_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_phone,''), NULLIF(p_car_number,''),
    p_privacy_agreed, 'registered', now(), NULL, v_code, v_token
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status','registered','id',v_id,'lookup_code',v_code,'device_token',v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_trainee(
  p_training_id uuid, p_org_type text, p_organization text, p_department text,
  p_position text, p_name text, p_car_number text, p_inquiry text,
  p_privacy_agreed boolean, p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t trainings%ROWTYPE; v_count int; v_status text; v_pos int;
  v_id uuid; v_existing uuid; v_email text; v_code text; v_token text;
BEGIN
  PERFORM _assert_training_open_for_pre_reg(p_training_id);
  SELECT * INTO v_t FROM trainings WHERE id = p_training_id FOR UPDATE;

  v_email := normalize_email(p_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'Email required' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_existing FROM trainees
   WHERE training_id = p_training_id AND normalize_email(email) = v_email AND status <> 'cancelled' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate'); END IF;

  IF v_t.capacity_enabled AND v_t.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM trainees
     WHERE training_id = p_training_id AND status IN ('confirmed','registered');
    IF v_count < v_t.capacity THEN v_status := 'registered';
    ELSIF v_t.allow_waitlist THEN v_status := 'waitlisted';
    ELSE RETURN jsonb_build_object('status','full');
    END IF;
  ELSE v_status := 'registered'; END IF;

  v_code := gen_lookup_code_for_training(p_training_id);
  v_token := _gen_device_token();

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at,
    lookup_code, device_token
  ) VALUES (
    p_training_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    NULL, p_privacy_agreed, v_status, NULL, v_code, v_token
  ) RETURNING id INTO v_id;

  IF v_status = 'waitlisted' THEN
    SELECT count(*) INTO v_pos FROM trainees
     WHERE training_id = p_training_id AND status = 'waitlisted'
       AND registered_at <= (SELECT registered_at FROM trainees WHERE id = v_id);
  END IF;

  RETURN jsonb_build_object('status',v_status,'id',v_id,'position',v_pos,'lookup_code',v_code,'device_token',v_token);
END;
$$;

-- ============================================================
-- 5) Device check-in (pre-registered → signature)
-- ============================================================
CREATE OR REPLACE FUNCTION public.device_checkin_attendee(
  p_event_id uuid, p_device_token text, p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_a attendees%ROWTYPE;
BEGIN
  PERFORM _assert_event_open_for_onsite(p_event_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;
  IF p_device_token IS NULL OR length(p_device_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_a FROM attendees
   WHERE event_id = p_event_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;

  IF v_a.status IN ('checked_in','walk_in') THEN
    RETURN jsonb_build_object('status','already',
      'attendee', jsonb_build_object('name',v_a.name,'organization',v_a.organization));
  END IF;

  UPDATE attendees
     SET status = 'checked_in', signature_url = p_signature_url, checked_in_at = now()
   WHERE id = v_a.id;

  RETURN jsonb_build_object('status','checked_in',
    'attendee', jsonb_build_object('name',v_a.name,'organization',v_a.organization));
END;
$$;

CREATE OR REPLACE FUNCTION public.device_checkin_trainee(
  p_training_id uuid, p_device_token text, p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t trainees%ROWTYPE;
BEGIN
  PERFORM _assert_training_open_for_onsite(p_training_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;
  IF p_device_token IS NULL OR length(p_device_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_t FROM trainees
   WHERE training_id = p_training_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;

  IF v_t.status IN ('confirmed','walk_in') THEN
    RETURN jsonb_build_object('status','already',
      'trainee', jsonb_build_object('name',v_t.name,'organization',v_t.organization));
  END IF;

  UPDATE trainees
     SET status = 'confirmed', signature_url = p_signature_url, confirmed_at = now()
   WHERE id = v_t.id;

  RETURN jsonb_build_object('status','checked_in',
    'trainee', jsonb_build_object('name',v_t.name,'organization',v_t.organization),
    'was_waitlisted', v_t.status = 'waitlisted');
END;
$$;

-- ============================================================
-- 6) Self walk-in (with auto upgrade of matching pre-reg)
-- ============================================================
CREATE OR REPLACE FUNCTION public.walk_in_attendee_self(
  p_event_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_phone text,
  p_car_number text, p_signature_url text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_email text; v_existing attendees%ROWTYPE; v_token text;
BEGIN
  PERFORM _assert_event_open_for_onsite(p_event_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_email := normalize_email(p_email);
  v_token := _gen_device_token();

  IF v_email IS NOT NULL THEN
    SELECT * INTO v_existing FROM attendees
     WHERE event_id = p_event_id AND normalize_email(email) = v_email AND status <> 'cancelled' LIMIT 1;
    IF FOUND THEN
      IF v_existing.status IN ('checked_in','walk_in') THEN
        RETURN jsonb_build_object('status','already',
          'attendee', jsonb_build_object('name',v_existing.name,'organization',v_existing.organization));
      END IF;
      -- registered → upgrade to checked_in, store signature, reissue token
      UPDATE attendees SET
        status = 'checked_in',
        signature_url = p_signature_url,
        checked_in_at = now(),
        device_token = v_token,
        org_type = COALESCE(p_org_type, org_type),
        organization = COALESCE(p_organization, organization),
        department = COALESCE(NULLIF(p_department,''), department),
        position = COALESCE(NULLIF(p_position,''), position),
        name = COALESCE(p_name, name),
        phone = COALESCE(NULLIF(p_phone,''), phone),
        car_number = COALESCE(NULLIF(p_car_number,''), car_number),
        privacy_agreed = privacy_agreed OR p_privacy_agreed
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('status','checked_in','id',v_existing.id,'device_token',v_token,
        'attendee', jsonb_build_object('name',v_existing.name,'organization',v_existing.organization));
    END IF;
  END IF;

  INSERT INTO attendees (
    event_id, email, org_type, organization, department, position, name,
    phone, car_number, privacy_agreed, status, signature_url,
    registered_at, checked_in_at, device_token
  ) VALUES (
    p_event_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_phone,''), NULLIF(p_car_number,''),
    p_privacy_agreed, 'walk_in', p_signature_url,
    now(), now(), v_token
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status','walk_in','id',v_id,'device_token',v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.walk_in_trainee_self(
  p_training_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_car_number text,
  p_inquiry text, p_signature_url text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_email text; v_existing trainees%ROWTYPE; v_token text;
BEGIN
  PERFORM _assert_training_open_for_onsite(p_training_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_email := normalize_email(p_email);
  v_token := _gen_device_token();

  IF v_email IS NOT NULL THEN
    SELECT * INTO v_existing FROM trainees
     WHERE training_id = p_training_id AND normalize_email(email) = v_email AND status <> 'cancelled' LIMIT 1;
    IF FOUND THEN
      IF v_existing.status IN ('confirmed','walk_in') THEN
        RETURN jsonb_build_object('status','already',
          'trainee', jsonb_build_object('name',v_existing.name,'organization',v_existing.organization));
      END IF;
      UPDATE trainees SET
        status = 'confirmed',
        signature_url = p_signature_url,
        confirmed_at = now(),
        device_token = v_token,
        org_type = COALESCE(p_org_type, org_type),
        organization = COALESCE(p_organization, organization),
        department = COALESCE(NULLIF(p_department,''), department),
        position = COALESCE(NULLIF(p_position,''), position),
        name = COALESCE(p_name, name),
        car_number = COALESCE(NULLIF(p_car_number,''), car_number),
        inquiry = COALESCE(NULLIF(p_inquiry,''), inquiry),
        privacy_agreed = privacy_agreed OR p_privacy_agreed
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('status','checked_in','id',v_existing.id,'device_token',v_token,
        'was_waitlisted', v_existing.status = 'waitlisted',
        'trainee', jsonb_build_object('name',v_existing.name,'organization',v_existing.organization));
    END IF;
  END IF;

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at,
    device_token
  ) VALUES (
    p_training_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    p_signature_url, p_privacy_agreed, 'walk_in', now(), v_token
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status','walk_in','id',v_id,'device_token',v_token);
END;
$$;

-- ============================================================
-- 7) Device recheck
-- ============================================================
CREATE OR REPLACE FUNCTION public.device_recheck_attendee(
  p_event_id uuid, p_device_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_a attendees%ROWTYPE;
BEGIN
  PERFORM _assert_event_open_for_recheck(p_event_id);
  IF p_device_token IS NULL OR length(p_device_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_a FROM attendees
   WHERE event_id = p_event_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_a.status NOT IN ('checked_in','walk_in') THEN
    RETURN jsonb_build_object('status','not_checked_in');
  END IF;
  IF v_a.rechecked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','already',
      'attendee', jsonb_build_object('name',v_a.name,'organization',v_a.organization));
  END IF;

  UPDATE attendees SET rechecked_at = now() WHERE id = v_a.id;
  RETURN jsonb_build_object('status','rechecked',
    'attendee', jsonb_build_object('name',v_a.name,'organization',v_a.organization));
END;
$$;

CREATE OR REPLACE FUNCTION public.device_recheck_trainee(
  p_training_id uuid, p_device_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t trainees%ROWTYPE;
BEGIN
  PERFORM _assert_training_open_for_recheck(p_training_id);
  IF p_device_token IS NULL OR length(p_device_token) < 16 THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_t FROM trainees
   WHERE training_id = p_training_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_t.status NOT IN ('confirmed','walk_in') THEN
    RETURN jsonb_build_object('status','not_checked_in');
  END IF;
  IF v_t.rechecked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','already',
      'trainee', jsonb_build_object('name',v_t.name,'organization',v_t.organization));
  END IF;

  UPDATE trainees SET rechecked_at = now() WHERE id = v_t.id;
  RETURN jsonb_build_object('status','rechecked',
    'trainee', jsonb_build_object('name',v_t.name,'organization',v_t.organization));
END;
$$;

-- ============================================================
-- 8) Lookup my registration by token (for state display before checkin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lookup_by_device_token(
  p_kind text, p_id uuid, p_device_token text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF p_device_token IS NULL OR length(p_device_token) < 16 THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF p_kind = 'event' THEN
    SELECT jsonb_build_object('status','found',
      'name', name, 'organization', organization,
      'record_status', status, 'rechecked_at', rechecked_at,
      'checked_in_at', checked_in_at, 'lookup_code', lookup_code)
      INTO r FROM attendees
     WHERE event_id = p_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  ELSE
    SELECT jsonb_build_object('status','found',
      'name', name, 'organization', organization,
      'record_status', status, 'rechecked_at', rechecked_at,
      'checked_in_at', confirmed_at, 'lookup_code', lookup_code)
      INTO r FROM trainees
     WHERE training_id = p_id AND device_token = p_device_token AND status <> 'cancelled' LIMIT 1;
  END IF;
  IF r IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN r;
END;
$$;

-- ============================================================
-- 9) Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.device_checkin_attendee(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_checkin_trainee(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.walk_in_attendee_self(uuid, text, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.walk_in_trainee_self(uuid, text, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_recheck_attendee(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_recheck_trainee(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_by_device_token(text, uuid, text) TO anon, authenticated;

-- ============================================================
-- 10) Drop deprecated functions
-- ============================================================
DROP FUNCTION IF EXISTS public.checkin_attendee(uuid, text, text);
DROP FUNCTION IF EXISTS public.checkin_trainee(uuid, text, text);
DROP FUNCTION IF EXISTS public.walk_in_attendee(uuid, text, text, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.walk_in_trainee(uuid, text, text, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.lookup_attendee(uuid, text);
DROP FUNCTION IF EXISTS public.lookup_trainee(uuid, text);
