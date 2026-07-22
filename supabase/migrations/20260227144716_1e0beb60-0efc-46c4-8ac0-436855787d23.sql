
CREATE TABLE public.search_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  search_log_id uuid REFERENCES public.search_logs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  request_type text,
  match_section text,
  empty_leg_id text,
  metadata jsonb DEFAULT '{}'
);

ALTER TABLE public.search_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select search conversions"
  ON public.search_conversions
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete search conversions"
  ON public.search_conversions
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
