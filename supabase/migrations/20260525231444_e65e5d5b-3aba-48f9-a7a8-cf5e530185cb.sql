-- 1. Restrict events SELECT to authenticated owners + super_admin
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "Owners and super admins can view events"
ON public.events FOR SELECT
TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Restrict trainings SELECT similarly
DROP POLICY IF EXISTS "Trainings are viewable by everyone" ON public.trainings;
CREATE POLICY "Owners and super admins can view trainings"
ON public.trainings FOR SELECT
TO authenticated
USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Public RPC: get event by access code (without access_code field)
CREATE OR REPLACE FUNCTION public.get_event_by_access_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_e events%ROWTYPE;
BEGIN
  SELECT * INTO v_e FROM events WHERE access_code = p_code LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', v_e.id,
    'title', v_e.title,
    'description', v_e.description,
    'event_date', v_e.event_date,
    'start_time', v_e.start_time,
    'end_time', v_e.end_time,
    'location', v_e.location,
    'organizer', v_e.organizer,
    'status', v_e.status,
    'poster_url', v_e.poster_url,
    'show_car_number', v_e.show_car_number,
    'recheck_enabled', v_e.recheck_enabled,
    'pre_registration_close_at', v_e.pre_registration_close_at
  );
END;
$$;

-- 4. Public RPC: get training by access code (without access_code field)
CREATE OR REPLACE FUNCTION public.get_training_by_access_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_t trainings%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM trainings WHERE access_code = p_code LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', v_t.id,
    'title', v_t.title,
    'description', v_t.description,
    'event_date', v_t.event_date,
    'start_time', v_t.start_time,
    'end_time', v_t.end_time,
    'location', v_t.location,
    'organizer', v_t.organizer,
    'instructor', v_t.instructor,
    'status', v_t.status,
    'poster_url', v_t.poster_url,
    'show_car_number', v_t.show_car_number,
    'capacity_enabled', v_t.capacity_enabled,
    'capacity', v_t.capacity,
    'allow_waitlist', v_t.allow_waitlist,
    'recheck_enabled', v_t.recheck_enabled,
    'pre_registration_close_at', v_t.pre_registration_close_at
  );
END;
$$;

-- 5. Tighten event-posters storage: only the uploader (path-prefix) can update/delete
DROP POLICY IF EXISTS "Authenticated users can delete event posters" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update event posters" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload event posters" ON storage.objects;

CREATE POLICY "Users can upload event posters in own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-posters'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own event posters"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-posters'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can delete own event posters"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-posters'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- 6. Make signatures bucket private (signatures are stored as data URLs, not files)
UPDATE storage.buckets SET public = false WHERE id = 'signatures';
DROP POLICY IF EXISTS "Signature images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload signatures" ON storage.objects;