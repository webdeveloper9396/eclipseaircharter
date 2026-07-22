
CREATE TYPE public.charter_trip_type AS ENUM ('one_way', 'multi_city');
CREATE TYPE public.charter_contact_method AS ENUM ('call', 'email', 'whatsapp');

CREATE TABLE public.charter_enquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_type public.charter_trip_type NOT NULL,
  legs JSONB NOT NULL,
  return_date DATE,
  return_hour SMALLINT CHECK (return_hour IS NULL OR (return_hour >= 0 AND return_hour <= 23)),
  passengers INTEGER NOT NULL CHECK (passengers >= 1 AND passengers <= 500),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_country TEXT NOT NULL,
  preferred_contact public.charter_contact_method NOT NULL,
  submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charter_enquiries TO authenticated;
GRANT ALL ON public.charter_enquiries TO service_role;

ALTER TABLE public.charter_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert enquiries"
  ON public.charter_enquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view enquiries"
  ON public.charter_enquiries
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update enquiries"
  ON public.charter_enquiries
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete enquiries"
  ON public.charter_enquiries
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_charter_enquiries_updated_at
  BEFORE UPDATE ON public.charter_enquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_charter_enquiries_created_at ON public.charter_enquiries (created_at DESC);
CREATE INDEX idx_charter_enquiries_user ON public.charter_enquiries (submitted_by_user_id);
