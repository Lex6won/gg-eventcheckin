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
  v_effective_start_ts timestamptz;
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
  -- Activate in_progress 1 hour before scheduled start so early arrivals can sign in
  v_effective_start_ts := v_start_ts - interval '1 hour';
  IF v_pre_close IS NULL THEN v_pre_close := v_effective_start_ts; END IF;

  IF v_status = '완료' OR v_now > v_end_ts THEN
    v_phase := 'closed';
  ELSIF v_now BETWEEN v_effective_start_ts AND v_end_ts THEN
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

-- Match pre-reg gating with the new 1-hour-early activation window
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
  v_close := COALESCE(
    v_e.pre_registration_close_at,
    (v_e.event_date || ' ' || v_e.start_time)::timestamptz - interval '1 hour'
  );
  IF now() > v_close THEN RAISE EXCEPTION 'Pre-registration closed' USING ERRCODE = 'P0003'; END IF;
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
  v_close := COALESCE(
    v_t.pre_registration_close_at,
    (v_t.event_date || ' ' || v_t.start_time)::timestamptz - interval '1 hour'
  );
  IF now() > v_close THEN RAISE EXCEPTION 'Pre-registration closed' USING ERRCODE = 'P0003'; END IF;
END;
$$;