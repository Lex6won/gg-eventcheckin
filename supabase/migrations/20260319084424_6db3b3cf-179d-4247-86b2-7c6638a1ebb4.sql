
-- Create events table
CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text NOT NULL,
  organizer text NOT NULL,
  qr_code_url text,
  access_code text NOT NULL,
  status text CHECK (status IN ('예정', '진행중', '완료')) DEFAULT '예정',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create attendees table
CREATE TABLE public.attendees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  organization text NOT NULL,
  position text,
  name text NOT NULL,
  phone text NOT NULL,
  signature_url text NOT NULL,
  checked_in_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;

-- Events: readable by everyone
CREATE POLICY "Events are viewable by everyone" ON public.events FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update events" ON public.events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete events" ON public.events FOR DELETE TO authenticated USING (true);

-- Attendees: anyone can insert (attendance registration)
CREATE POLICY "Anyone can register attendance" ON public.attendees FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can view attendees" ON public.attendees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update attendees" ON public.attendees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete attendees" ON public.attendees FOR DELETE TO authenticated USING (true);

-- Signatures storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true);
CREATE POLICY "Signature images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'signatures');
CREATE POLICY "Anyone can upload signatures" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Unique index on access_code
CREATE UNIQUE INDEX idx_events_access_code ON public.events(access_code);
