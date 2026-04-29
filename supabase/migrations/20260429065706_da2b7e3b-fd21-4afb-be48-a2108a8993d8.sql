-- 1. trainings 테이블
CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text NOT NULL,
  organizer text NOT NULL,
  instructor text,
  access_code text NOT NULL UNIQUE,
  status text DEFAULT '예정',
  poster_url text,
  show_car_number boolean NOT NULL DEFAULT false,
  capacity_enabled boolean NOT NULL DEFAULT false,
  capacity integer,
  allow_waitlist boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainings are viewable by everyone"
  ON public.trainings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create trainings"
  ON public.trainings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update own trainings"
  ON public.trainings FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can delete own trainings"
  ON public.trainings FOR DELETE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_trainings_updated_at
  BEFORE UPDATE ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. trainees 테이블
CREATE TABLE public.trainees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  org_type text,
  organization text NOT NULL,
  department text,
  position text,
  name text NOT NULL,
  car_number text,
  inquiry text,
  signature_url text NOT NULL,
  privacy_agreed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'confirmed',
  registered_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT trainees_status_check CHECK (status IN ('confirmed','waitlisted','cancelled'))
);

CREATE INDEX idx_trainees_training ON public.trainees(training_id);
CREATE UNIQUE INDEX idx_trainees_unique_active
  ON public.trainees(training_id, lower(name), lower(organization))
  WHERE status <> 'cancelled';

ALTER TABLE public.trainees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register trainees"
  ON public.trainees FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Training creators can view trainees"
  ON public.trainees FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = trainees.training_id AND t.created_by = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Training creators can update trainees"
  ON public.trainees FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = trainees.training_id AND t.created_by = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Training creators can delete trainees"
  ON public.trainees FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trainings t WHERE t.id = trainees.training_id AND t.created_by = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. register_trainee 함수 (원자적 정원 검증)
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
  p_privacy_agreed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training trainings%ROWTYPE;
  v_confirmed_count integer;
  v_status text;
  v_position integer;
  v_id uuid;
  v_existing_id uuid;
BEGIN
  -- 행 잠금으로 동시성 제어
  SELECT * INTO v_training FROM trainings WHERE id = p_training_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training not found';
  END IF;

  IF v_training.status = '완료' THEN
    RAISE EXCEPTION 'Training closed';
  END IF;

  -- 중복 검사 (취소 제외)
  SELECT id INTO v_existing_id FROM trainees
   WHERE training_id = p_training_id
     AND lower(name) = lower(p_name)
     AND lower(organization) = lower(p_organization)
     AND status <> 'cancelled'
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_training.capacity_enabled AND v_training.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_confirmed_count
      FROM trainees WHERE training_id = p_training_id AND status = 'confirmed';

    IF v_confirmed_count < v_training.capacity THEN
      v_status := 'confirmed';
    ELSIF v_training.allow_waitlist THEN
      v_status := 'waitlisted';
    ELSE
      RETURN jsonb_build_object('status', 'full');
    END IF;
  ELSE
    v_status := 'confirmed';
  END IF;

  INSERT INTO trainees (
    training_id, org_type, organization, department, position, name,
    car_number, inquiry, signature_url, privacy_agreed, status, confirmed_at
  ) VALUES (
    p_training_id, p_org_type, p_organization, NULLIF(p_department,''),
    NULLIF(p_position,''), p_name,
    NULLIF(p_car_number,''), NULLIF(p_inquiry,''),
    p_signature_url, p_privacy_agreed, v_status,
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END
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

-- 4. 대기자 → 확정 승격 함수
CREATE OR REPLACE FUNCTION public.promote_trainee_from_waitlist(p_trainee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainee trainees%ROWTYPE;
  v_training trainings%ROWTYPE;
  v_confirmed_count integer;
BEGIN
  SELECT * INTO v_trainee FROM trainees WHERE id = p_trainee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trainee not found'; END IF;

  -- 권한 검사
  SELECT * INTO v_training FROM trainings WHERE id = v_trainee.training_id FOR UPDATE;
  IF NOT (v_training.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_trainee.status <> 'waitlisted' THEN
    RAISE EXCEPTION 'Not waitlisted';
  END IF;

  IF v_training.capacity_enabled AND v_training.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_confirmed_count
      FROM trainees WHERE training_id = v_training.id AND status = 'confirmed';
    IF v_confirmed_count >= v_training.capacity THEN
      RETURN jsonb_build_object('status', 'full');
    END IF;
  END IF;

  UPDATE trainees SET status = 'confirmed', confirmed_at = now() WHERE id = p_trainee_id;
  RETURN jsonb_build_object('status', 'confirmed');
END;
$$;