
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  department text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 6. RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 7. Assign super_admin role to gg0018@gg.go.kr
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users WHERE email = 'gg0018@gg.go.kr'
ON CONFLICT (user_id, role) DO NOTHING;

-- 8. Auto-assign admin role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 9. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 10. Update events RLS: allow super_admin to update/delete any event
DROP POLICY IF EXISTS "Authenticated users can update own events" ON public.events;
CREATE POLICY "Authenticated users can update own events" ON public.events
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated users can delete own events" ON public.events;
CREATE POLICY "Authenticated users can delete own events" ON public.events
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'));

-- 11. Update attendees RLS: SELECT only own event attendees or super_admin
DROP POLICY IF EXISTS "Authenticated users can view attendees" ON public.attendees;
CREATE POLICY "Authenticated users can view attendees" ON public.attendees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = attendees.event_id AND events.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- 12. Update attendees DELETE/UPDATE: also allow super_admin
DROP POLICY IF EXISTS "Event creators can delete attendees" ON public.attendees;
CREATE POLICY "Event creators can delete attendees" ON public.attendees
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = attendees.event_id AND events.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Event creators can update attendees" ON public.attendees;
CREATE POLICY "Event creators can update attendees" ON public.attendees
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = attendees.event_id AND events.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
