ALTER TABLE public.trainees
  DROP CONSTRAINT IF EXISTS trainees_status_check;

ALTER TABLE public.trainees
  ADD CONSTRAINT trainees_status_check
  CHECK (status IN ('registered', 'confirmed', 'waitlisted', 'cancelled', 'walk_in'));
