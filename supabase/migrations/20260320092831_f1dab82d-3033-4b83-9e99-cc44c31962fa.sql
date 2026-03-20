
-- Add poster_url column to events table
ALTER TABLE public.events ADD COLUMN poster_url text;

-- Create event-posters storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('event-posters', 'event-posters', true);

-- RLS: Anyone can view posters
CREATE POLICY "Anyone can view event posters"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-posters');

-- RLS: Authenticated users can upload posters
CREATE POLICY "Authenticated users can upload event posters"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-posters');

-- RLS: Authenticated users can update their posters
CREATE POLICY "Authenticated users can update event posters"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-posters');

-- RLS: Authenticated users can delete their posters
CREATE POLICY "Authenticated users can delete event posters"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-posters');
