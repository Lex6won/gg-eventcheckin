CREATE OR REPLACE FUNCTION public.claim_pre_registration_by_email(p_kind text, p_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_token text;
  v_a attendees%ROWTYPE;
  v_t trainees%ROWTYPE;
BEGIN
  v_email := normalize_email(p_email);
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('status','invalid_email');
  END IF;
  v_token := _gen_device_token();

  IF p_kind = 'event' THEN
    PERFORM _assert_event_open_for_onsite(p_id);
    SELECT * INTO v_a FROM attendees
     WHERE event_id = p_id
       AND normalize_email(email) = v_email
       AND status <> 'cancelled'
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','not_found');
    END IF;
    IF v_a.status IN ('checked_in','walk_in') THEN
      RETURN jsonb_build_object('status','already',
        'name', v_a.name, 'organization', v_a.organization);
    END IF;
    UPDATE attendees SET device_token = v_token WHERE id = v_a.id;
    RETURN jsonb_build_object('status','found',
      'device_token', v_token,
      'name', v_a.name, 'organization', v_a.organization);
  ELSIF p_kind = 'training' THEN
    PERFORM _assert_training_open_for_onsite(p_id);
    SELECT * INTO v_t FROM trainees
     WHERE training_id = p_id
       AND normalize_email(email) = v_email
       AND status <> 'cancelled'
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','not_found');
    END IF;
    IF v_t.status IN ('confirmed','walk_in') THEN
      RETURN jsonb_build_object('status','already',
        'name', v_t.name, 'organization', v_t.organization);
    END IF;
    UPDATE trainees SET device_token = v_token WHERE id = v_t.id;
    RETURN jsonb_build_object('status','found',
      'device_token', v_token,
      'name', v_t.name, 'organization', v_t.organization);
  ELSE
    RAISE EXCEPTION 'Invalid kind' USING ERRCODE = '22023';
  END IF;
END;
$$;