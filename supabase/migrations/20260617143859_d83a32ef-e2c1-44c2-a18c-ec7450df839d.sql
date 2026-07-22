ALTER TABLE public.search_conversions
  ADD COLUMN IF NOT EXISTS flow text NOT NULL DEFAULT 'empty_legs',
  ADD COLUMN IF NOT EXISTS enquiry_id uuid;

CREATE INDEX IF NOT EXISTS idx_search_conversions_flow ON public.search_conversions(flow);
CREATE INDEX IF NOT EXISTS idx_search_conversions_enquiry_id ON public.search_conversions(enquiry_id) WHERE enquiry_id IS NOT NULL;