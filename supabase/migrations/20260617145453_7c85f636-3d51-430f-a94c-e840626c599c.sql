CREATE TABLE public.charter_digest_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.charter_digest_subscriptions TO service_role;

ALTER TABLE public.charter_digest_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
  ON public.charter_digest_subscriptions
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER set_charter_digest_subscriptions_updated_at
  BEFORE UPDATE ON public.charter_digest_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.charter_digest_subscriptions (email)
VALUES ('db@eclipseaircharter.com')
ON CONFLICT (email) DO NOTHING;