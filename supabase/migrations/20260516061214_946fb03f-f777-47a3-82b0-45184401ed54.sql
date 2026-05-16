
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, department)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'department', '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET department = COALESCE(EXCLUDED.department, public.profiles.department);
  RETURN NEW;
END;
$$;
