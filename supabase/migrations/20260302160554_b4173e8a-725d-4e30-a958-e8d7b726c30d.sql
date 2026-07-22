ALTER TABLE public.search_logs
  ADD COLUMN exact_count integer DEFAULT NULL,
  ADD COLUMN nearby_count integer DEFAULT NULL,
  ADD COLUMN wider_count integer DEFAULT NULL;