
-- Tighten events policies: only creator can update/delete
DROP POLICY "Authenticated users can create events" ON public.events;
DROP POLICY "Authenticated users can update events" ON public.events;
DROP POLICY "Authenticated users can delete events" ON public.events;

CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update own events" ON public.events FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Authenticated users can delete own events" ON public.events FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Tighten attendees update/delete: only event creator can manage
DROP POLICY "Authenticated users can update attendees" ON public.attendees;
DROP POLICY "Authenticated users can delete attendees" ON public.attendees;

CREATE POLICY "Event creators can update attendees" ON public.attendees FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events WHERE events.id = attendees.event_id AND events.created_by = auth.uid())
);
CREATE POLICY "Event creators can delete attendees" ON public.attendees FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events WHERE events.id = attendees.event_id AND events.created_by = auth.uid())
);
