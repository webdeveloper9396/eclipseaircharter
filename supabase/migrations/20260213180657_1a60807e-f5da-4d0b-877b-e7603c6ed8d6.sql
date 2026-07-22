
-- Add INSERT policy to profiles table for defense-in-depth
-- The handle_new_user() trigger (SECURITY DEFINER) already handles profile creation,
-- but this policy provides an additional safety layer.
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
