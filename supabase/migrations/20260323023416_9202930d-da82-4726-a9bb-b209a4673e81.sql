ALTER TABLE public.attendees ADD COLUMN email text;
ALTER TABLE public.attendees ALTER COLUMN phone DROP NOT NULL;