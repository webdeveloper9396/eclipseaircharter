
-- #3 + #9: replace overly-permissive authenticated INSERT with scoped policies for anon + authenticated
DROP POLICY IF EXISTS "Authenticated users can insert enquiries" ON public.charter_enquiries;

CREATE POLICY "Authenticated users can insert their own enquiries"
  ON public.charter_enquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by_user_id = auth.uid());

CREATE POLICY "Anonymous users can insert enquiries"
  ON public.charter_enquiries
  FOR INSERT
  TO anon
  WITH CHECK (submitted_by_user_id IS NULL);

GRANT INSERT ON public.charter_enquiries TO anon;

-- #10: add WITH CHECK to profiles UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
