-- Rate limiting table for edge functions
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_rate_limit_user_endpoint_time 
  ON public.rate_limit_log(user_id, endpoint, created_at DESC);

-- Enable RLS
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Only service role should interact with this table (via edge functions)
-- No direct user access needed

-- Auto-cleanup: delete entries older than 1 hour to keep table small
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_log WHERE created_at < now() - interval '1 hour';
$$;