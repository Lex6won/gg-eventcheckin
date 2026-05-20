CREATE OR REPLACE FUNCTION public.count_trainees_registered(p_training_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.trainees
  WHERE training_id = p_training_id
    AND status IN ('registered','confirmed');
$$;

GRANT EXECUTE ON FUNCTION public.count_trainees_registered(uuid) TO anon, authenticated;