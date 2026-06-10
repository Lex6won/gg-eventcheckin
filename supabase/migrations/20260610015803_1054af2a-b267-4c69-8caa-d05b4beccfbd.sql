-- Restrict access to the private 'signatures' bucket. Signatures are stored as
-- Base64 Data URLs in DB; the bucket is unused. Lock down storage.objects so
-- only super_admin can access if ever used, and admins can read for their own
-- events/trainings via ownership join.

DROP POLICY IF EXISTS "signatures: super_admin all" ON storage.objects;
DROP POLICY IF EXISTS "signatures: admin read own event" ON storage.objects;
DROP POLICY IF EXISTS "signatures: admin read own training" ON storage.objects;

CREATE POLICY "signatures: super_admin all"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'signatures' AND public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (bucket_id = 'signatures' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "signatures: admin read own event"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (
    SELECT 1 FROM public.attendees a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.signature_url LIKE '%' || storage.objects.name || '%'
      AND e.created_by = auth.uid()
  )
);

CREATE POLICY "signatures: admin read own training"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (
    SELECT 1 FROM public.trainees t
    JOIN public.trainings tr ON tr.id = t.training_id
    WHERE t.signature_url LIKE '%' || storage.objects.name || '%'
      AND tr.created_by = auth.uid()
  )
);