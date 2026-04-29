
-- =========================================================
-- 1) Email normalization helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.normalize_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(lower(coalesce(trim(p), '')), '\s+', '', 'g'),
    ''
  );
$$;

-- =========================================================
-- 2) Schema additions
-- =========================================================
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS lookup_code text;

ALTER TABLE public.trainees
  ADD COLUMN IF NOT EXISTS lookup_code text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS pre_registration_close_at timestamptz;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS pre_registration_close_at timestamptz;

-- Unique lookup code within event/training
CREATE UNIQUE INDEX IF NOT EXISTS attendees_event_lookup_code_unique
  ON public.attendees (event_id, lookup_code)
  WHERE lookup_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trainees_training_lookup_code_unique
  ON public.trainees (training_id, lookup_code)
  WHERE lookup_code IS NOT NULL;

-- Drop legacy name+org unique index (replaced by email)
DROP INDEX IF EXISTS public.idx_trainees_unique_active;

-- =========================================================
-- 3) Lock down public INSERT policies
-- =========================================================
DROP POLICY IF EXISTS "Anyone can register attendance" ON public.attendees;
DROP POLICY IF EXISTS "Anyone can register trainees" ON public.trainees;

-- =========================================================
-- 4) Helper: generate a 6-digit lookup code unique within scope
-- =========================================================
CREATE OR REPLACE FUNCTION public.gen_lookup_code_for_event(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    SELECT EXISTS (SELECT 1 FROM attendees WHERE event_id = p_event_id AND lookup_code = v_code)
      INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_tries := v_tries + 1;
    IF v_tries > 20 THEN
      RAISE EXCEPTION 'Could not allocate lookup code';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_lookup_code_for_training(p_training_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    SELECT EXISTS (SELECT 1 FROM trainees WHERE training_id = p_training_id AND lookup_code = v_code)
      INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_tries := v_tries + 1;
    IF v_tries > 20 THEN
      RAISE EXCEPTION 'Could not allocate lookup code';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

-- =========================================================
-- 5) Public status function (event OR training by access_code)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_event_public_status(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_train trainings%ROWTYPE;
  v_kind text;
  v_id uuid;
  v_date date;
  v_start time;
  v_end time;
  v_status text;
  v_pre_close timestamptz;
  v_now timestamptz := now();
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_phase text;
BEGIN
  SELECT * INTO v_event FROM events WHERE access_code = p_code LIMIT 1;
  IF FOUND THEN
    v_kind := 'event'; v_id := v_event.id; v_date := v_event.event_date;
    v_start := v_event.start_time; v_end := v_event.end_time;
    v_status := v_event.status; v_pre_close := v_event.pre_registration_close_at;
  ELSE
    SELECT * INTO v_train FROM trainings WHERE access_code = p_code LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('phase', 'not_found');
    END IF;
    v_kind := 'training'; v_id := v_train.id; v_date := v_train.event_date;
    v_start := v_train.start_time; v_end := v_train.end_time;
    v_status := v_train.status; v_pre_close := v_train.pre_registration_close_at;
  END IF;

  v_start_ts := (v_date || ' ' || v_start)::timestamptz;
  v_end_ts   := (v_date || ' ' || v_end)::timestamptz;
  IF v_pre_close IS NULL THEN v_pre_close := v_start_ts; END IF;

  IF v_status = '완료' OR v_now > v_end_ts THEN
    v_phase := 'closed';
  ELSIF v_now BETWEEN v_start_ts AND v_end_ts THEN
    v_phase := 'in_progress';
  ELSIF v_now > v_pre_close THEN
    v_phase := 'pre_reg_closed';
  ELSE
    v_phase := 'open';
  END IF;

  RETURN jsonb_build_object(
    'phase', v_phase,
    'kind', v_kind,
    'id', v_id,
    'pre_registration_close_at', v_pre_close,
    'start_at', v_start_ts,
    'end_at', v_end_ts,
    'status', v_status
  );
END;
$$;

-- =========================================================
-- 6) Internal gating helper used inside RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public._assert_event_open_for_pre_reg(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e events%ROWTYPE;
  v_close timestamptz;
BEGIN
  SELECT * INTO v_e FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  IF v_e.status = '완료' THEN RAISE EXCEPTION 'Event closed' USING ERRCODE = 'P0001'; END IF;
  v_close := COALESCE(v_e.pre_registration_close_at, (v_e.event_date || ' ' || v_e.start_time)::timestamptz);
  IF now() > v_close THEN RAISE EXCEPTION 'Pre-registration closed' USING ERRCODE = 'P0003'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_event_open_for_onsite(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e events%ROWTYPE;
  v_end timestamptz;
BEGIN
  SELECT * INTO v_e FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  IF v_e.status = '완료' THEN RAISE EXCEPTION 'Event closed' USING ERRCODE = 'P0001'; END IF;
  v_end := (v_e.event_date || ' ' || v_e.end_time)::timestamptz;
  IF now() > v_end + interval '6 hours' THEN
    RAISE EXCEPTION 'Event ended' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_training_open_for_pre_reg(p_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t trainings%ROWTYPE;
  v_close timestamptz;
BEGIN
  SELECT * INTO v_t FROM trainings WHERE id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training not found' USING ERRCODE = 'P0002'; END IF;
  IF v_t.status = '완료' THEN RAISE EXCEPTION 'Training closed' USING ERRCODE = 'P0001'; END IF;
  v_close := COALESCE(v_t.pre_registration_close_at, (v_t.event_date || ' ' || v_t.start_time)::timestamptz);
  IF now() > v_close THEN RAISE EXCEPTION 'Pre-registration closed' USING ERRCODE = 'P0003'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_training_open_for_onsite(p_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t trainings%ROWTYPE;
  v_end timestamptz;
BEGIN
  SELECT * INTO v_t FROM trainings WHERE id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training not found' USING ERRCODE = 'P0002'; END IF;
  IF v_t.status = '완료' THEN RAISE EXCEPTION 'Training closed' USING ERRCODE = 'P0001'; END IF;
  v_end := (v_t.event_date || ' ' || v_t.end_time)::timestamptz;
  IF now() > v_end + interval '6 hours' THEN
    RAISE EXCEPTION 'Training ended' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- =========================================================
-- 7) Re-create core RPCs with normalize_email + gating + lookup_code
-- =========================================================

-- 7a) Pre-register attendee (event)
DROP FUNCTION IF EXISTS public.register_attendee_pre(uuid, text, text, text, text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.register_attendee_pre(
  p_event_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_phone text,
  p_car_number text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
  v_email text;
  v_code text;
BEGIN
  PERFORM _assert_event_open_for_pre_reg(p_event_id);
  v_email := normalize_email(p_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'Email required' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_existing FROM attendees
   WHERE event_id = p_event_id
     AND normalize_email(email) = v_email
     AND status <> 'cancelled'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  v_code := gen_lookup_code_for_event(p_event_id);

  INSERT INTO attendees (
    event_id, email, org_type, organization, department, position, name,
    phone, car_number, privacy_agreed, status, registered_at, signature_url, lookup_code
  ) VALUES (
    p_event_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_phone,''), NULLIF(p_car_number,''),
    p_privacy_agreed, 'registered', now(), NULL, v_code
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'registered', 'id', v_id, 'lookup_code', v_code);
END;
$$;

-- 7b) Check-in attendee (event) — accepts email OR lookup_code via p_email
DROP FUNCTION IF EXISTS public.checkin_attendee(uuid, text, text);
CREATE OR REPLACE FUNCTION public.checkin_attendee(
  p_event_id uuid, p_email text, p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a attendees%ROWTYPE;
  v_q text;
  v_email text;
BEGIN
  PERFORM _assert_event_open_for_onsite(p_event_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_q := trim(coalesce(p_email, ''));
  v_email := normalize_email(v_q);

  -- Try email first, then lookup_code (6 digits)
  SELECT * INTO v_a FROM attendees
   WHERE event_id = p_event_id
     AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     )
   LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;

  IF v_a.status = 'checked_in' OR v_a.status = 'walk_in' THEN
    RETURN jsonb_build_object('status','already',
      'attendee', jsonb_build_object('name', v_a.name, 'organization', v_a.organization));
  END IF;

  UPDATE attendees
     SET status = 'checked_in',
         signature_url = p_signature_url,
         checked_in_at = now()
   WHERE id = v_a.id;

  RETURN jsonb_build_object('status','checked_in',
    'attendee', jsonb_build_object('name', v_a.name, 'organization', v_a.organization));
END;
$$;

-- 7c) Walk-in attendee (event)
DROP FUNCTION IF EXISTS public.walk_in_attendee(uuid, text, text, text, text, text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.walk_in_attendee(
  p_event_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_phone text,
  p_car_number text, p_signature_url text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
  v_email text;
BEGIN
  PERFORM _assert_event_open_for_onsite(p_event_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_email := normalize_email(p_email);
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_existing FROM attendees
     WHERE event_id = p_event_id
       AND normalize_email(email) = v_email
       AND status <> 'cancelled'
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','duplicate');
    END IF;
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

-- 7d) Pre-register / register trainee (training)
-- Capacity counts only pre-registered/confirmed (NOT walk_in) to honor decision
DROP FUNCTION IF EXISTS public.register_trainee(uuid, text, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.register_trainee(uuid, text, text, text, text, text, text, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.register_trainee(
  p_training_id uuid, p_org_type text, p_organization text, p_department text,
  p_position text, p_name text, p_car_number text, p_inquiry text,
  p_signature_url text, p_privacy_agreed boolean, p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t trainings%ROWTYPE;
  v_count int;
  v_status text;
  v_pos int;
  v_id uuid;
  v_existing uuid;
  v_email text;
  v_code text;
BEGIN
  PERFORM _assert_training_open_for_pre_reg(p_training_id);
  SELECT * INTO v_t FROM trainings WHERE id = p_training_id FOR UPDATE;

  v_email := normalize_email(p_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'Email required' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_existing FROM trainees
   WHERE training_id = p_training_id
     AND normalize_email(email) = v_email
     AND status <> 'cancelled' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate');
  END IF;

  IF v_t.capacity_enabled AND v_t.capacity IS NOT NULL THEN
    -- Count pre-registered + confirmed only (exclude walk_in)
    SELECT count(*) INTO v_count FROM trainees
     WHERE training_id = p_training_id
       AND status IN ('confirmed','registered');
    IF v_count < v_t.capacity THEN
      v_status := 'registered';
    ELSIF v_t.allow_waitlist THEN
      v_status := 'waitlisted';
    ELSE
      RETURN jsonb_build_object('status','full');
    END IF;
  ELSE
    v_status := 'registered';
  END IF;

  v_code := gen_lookup_code_for_training(p_training_id);

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at, lookup_code
  ) VALUES (
    p_training_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    NULLIF(p_signature_url,''), p_privacy_agreed, v_status, NULL, v_code
  ) RETURNING id INTO v_id;

  IF v_status = 'waitlisted' THEN
    SELECT count(*) INTO v_pos FROM trainees
     WHERE training_id = p_training_id AND status = 'waitlisted'
       AND registered_at <= (SELECT registered_at FROM trainees WHERE id = v_id);
  END IF;

  RETURN jsonb_build_object('status', v_status, 'id', v_id, 'position', v_pos, 'lookup_code', v_code);
END;
$$;

-- 7e) Check-in trainee
DROP FUNCTION IF EXISTS public.checkin_trainee(uuid, text, text);
CREATE OR REPLACE FUNCTION public.checkin_trainee(
  p_training_id uuid, p_email text, p_signature_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t trainees%ROWTYPE;
  v_q text;
  v_email text;
BEGIN
  PERFORM _assert_training_open_for_onsite(p_training_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_q := trim(coalesce(p_email,''));
  v_email := normalize_email(v_q);

  SELECT * INTO v_t FROM trainees
   WHERE training_id = p_training_id
     AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     )
   LIMIT 1;

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

-- 7f) Walk-in trainee
DROP FUNCTION IF EXISTS public.walk_in_trainee(uuid, text, text, text, text, text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.walk_in_trainee(
  p_training_id uuid, p_email text, p_org_type text, p_organization text,
  p_department text, p_position text, p_name text, p_car_number text,
  p_inquiry text, p_signature_url text, p_privacy_agreed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
  v_email text;
BEGIN
  PERFORM _assert_training_open_for_onsite(p_training_id);
  IF p_signature_url IS NULL OR length(p_signature_url) > 200000 THEN
    RAISE EXCEPTION 'Invalid signature' USING ERRCODE = '22023';
  END IF;

  v_email := normalize_email(p_email);
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_existing FROM trainees
     WHERE training_id = p_training_id
       AND normalize_email(email) = v_email
       AND status <> 'cancelled' LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','duplicate');
    END IF;
  END IF;

  INSERT INTO trainees (
    training_id, email, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at
  ) VALUES (
    p_training_id, v_email, p_org_type, p_organization,
    NULLIF(p_department,''), NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    p_signature_url, p_privacy_agreed, 'walk_in', now()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status','walk_in','id', v_id);
END;
$$;

-- =========================================================
-- 8) Lookup helpers (for unified search)
-- =========================================================
CREATE OR REPLACE FUNCTION public.lookup_attendee(p_event_id uuid, p_query text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text;
  v_email text;
  v_rec attendees%ROWTYPE;
  v_count int;
BEGIN
  v_q := trim(coalesce(p_query, ''));
  IF v_q = '' THEN RETURN jsonb_build_object('status','not_found'); END IF;
  v_email := normalize_email(v_q);

  SELECT count(*) INTO v_count FROM attendees
   WHERE event_id = p_event_id AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     );

  IF v_count = 0 THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_count > 1 THEN RETURN jsonb_build_object('status','multiple'); END IF;

  SELECT * INTO v_rec FROM attendees
   WHERE event_id = p_event_id AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     )
   LIMIT 1;

  RETURN jsonb_build_object(
    'status','found',
    'attendee', jsonb_build_object(
      'name', v_rec.name, 'organization', v_rec.organization,
      'status', v_rec.status, 'lookup_code', v_rec.lookup_code,
      'email', v_rec.email
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_trainee(p_training_id uuid, p_query text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q text;
  v_email text;
  v_rec trainees%ROWTYPE;
  v_count int;
BEGIN
  v_q := trim(coalesce(p_query, ''));
  IF v_q = '' THEN RETURN jsonb_build_object('status','not_found'); END IF;
  v_email := normalize_email(v_q);

  SELECT count(*) INTO v_count FROM trainees
   WHERE training_id = p_training_id AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     );

  IF v_count = 0 THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_count > 1 THEN RETURN jsonb_build_object('status','multiple'); END IF;

  SELECT * INTO v_rec FROM trainees
   WHERE training_id = p_training_id AND status <> 'cancelled'
     AND (
       (v_email IS NOT NULL AND normalize_email(email) = v_email)
       OR (v_q ~ '^[0-9]{6}$' AND lookup_code = v_q)
     )
   LIMIT 1;

  RETURN jsonb_build_object(
    'status','found',
    'trainee', jsonb_build_object(
      'name', v_rec.name, 'organization', v_rec.organization,
      'status', v_rec.status, 'lookup_code', v_rec.lookup_code,
      'email', v_rec.email
    )
  );
END;
$$;

-- =========================================================
-- 9) Auto status transition + signature purge
-- =========================================================
CREATE OR REPLACE FUNCTION public.auto_transition_event_statuses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Events
  UPDATE events
     SET status = '완료', updated_at = now()
   WHERE status <> '완료'
     AND now() > (event_date || ' ' || end_time)::timestamptz;

  UPDATE events
     SET status = '진행중', updated_at = now()
   WHERE status NOT IN ('완료','진행중')
     AND now() BETWEEN (event_date || ' ' || start_time)::timestamptz
                   AND (event_date || ' ' || end_time)::timestamptz;

  -- Trainings
  UPDATE trainings
     SET status = '완료', updated_at = now()
   WHERE status <> '완료'
     AND now() > (event_date || ' ' || end_time)::timestamptz;

  UPDATE trainings
     SET status = '진행중', updated_at = now()
   WHERE status NOT IN ('완료','진행중')
     AND now() BETWEEN (event_date || ' ' || start_time)::timestamptz
                   AND (event_date || ' ' || end_time)::timestamptz;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_signatures()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_a int;
  v_t int;
BEGIN
  UPDATE attendees a
     SET signature_url = NULL
   FROM events e
   WHERE a.event_id = e.id
     AND a.signature_url IS NOT NULL
     AND now() > (e.event_date || ' ' || e.end_time)::timestamptz + interval '6 months';
  GET DIAGNOSTICS v_a = ROW_COUNT;

  UPDATE trainees t
     SET signature_url = NULL
   FROM trainings tr
   WHERE t.training_id = tr.id
     AND t.signature_url IS NOT NULL
     AND now() > (tr.event_date || ' ' || tr.end_time)::timestamptz + interval '6 months';
  GET DIAGNOSTICS v_t = ROW_COUNT;

  RETURN v_a + v_t;
END;
$$;

-- =========================================================
-- 10) Export audit logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.export_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('event','training')),
  target_id uuid NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('xlsx','pdf')),
  includes_signature boolean NOT NULL DEFAULT false,
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own export logs" ON public.export_audit_logs;
CREATE POLICY "users insert own export logs"
ON public.export_audit_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users view own export logs" ON public.export_audit_logs;
CREATE POLICY "users view own export logs"
ON public.export_audit_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS export_audit_logs_target_idx
  ON public.export_audit_logs (target_type, target_id, created_at DESC);

-- =========================================================
-- 11) Grants — RPCs callable by anon/authenticated
-- =========================================================
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_public_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_attendee_pre(uuid, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_attendee(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.walk_in_attendee(uuid, text, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_trainee(uuid, text, text, text, text, text, text, text, text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_trainee(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.walk_in_trainee(uuid, text, text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_attendee(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_trainee(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_transition_event_statuses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_signatures() TO authenticated;
