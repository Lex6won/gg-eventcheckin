
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS car_number text,
  ADD COLUMN IF NOT EXISTS inquiry text,
  ADD COLUMN IF NOT EXISTS privacy_agreed boolean NOT NULL DEFAULT false;
