
-- featured_settings (single row)
CREATE TABLE public.featured_settings (
  id boolean PRIMARY KEY DEFAULT true,
  total_count integer NOT NULL DEFAULT 15 CHECK (total_count BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featured_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.featured_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.featured_settings TO authenticated;
GRANT ALL ON public.featured_settings TO service_role;

ALTER TABLE public.featured_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read featured settings"
  ON public.featured_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert featured settings"
  ON public.featured_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update featured settings"
  ON public.featured_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete featured settings"
  ON public.featured_settings FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.featured_settings (id, total_count) VALUES (true, 15);

-- featured_corridor_pairs
CREATE TABLE public.featured_corridor_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_a text NOT NULL,
  corridor_b text NOT NULL,
  weight numeric NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corridor_pair_distinct CHECK (corridor_a <> corridor_b)
);

CREATE UNIQUE INDEX featured_corridor_pairs_unordered_unique
  ON public.featured_corridor_pairs (LEAST(corridor_a, corridor_b), GREATEST(corridor_a, corridor_b));

GRANT SELECT ON public.featured_corridor_pairs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.featured_corridor_pairs TO authenticated;
GRANT ALL ON public.featured_corridor_pairs TO service_role;

ALTER TABLE public.featured_corridor_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read featured corridor pairs"
  ON public.featured_corridor_pairs FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert featured corridor pairs"
  ON public.featured_corridor_pairs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update featured corridor pairs"
  ON public.featured_corridor_pairs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete featured corridor pairs"
  ON public.featured_corridor_pairs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.featured_corridor_pairs (corridor_a, corridor_b, weight, is_active, sort_order) VALUES
  ('TORONTO_AREA', 'FLORIDA', 25, true, 1),
  ('NORTHEAST', 'FLORIDA', 25, true, 2),
  ('ENGLAND', 'MEDITERRANEAN', 25, true, 3),
  ('EASTERN_US', 'WESTERN_US', 25, true, 4);
