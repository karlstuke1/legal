-- AI Act Art. 12 prep: high-risk AI systems must retain automatically generated
-- logs for at least 6 months (Art. 12(3) requires logs to enable post-market
-- monitoring; Art. 19 + 26(6) reference 6-month minimum retention for the
-- system's deployers).
-- We extend audit_log retention from 90 days to 180 days. Datenschutz section
-- 2.3 needs a sync update — the change is documented in the new DSFA skeleton
-- alongside this migration.
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '180 days';
$$;

-- Profile flag for opt-in auto-pseudonymization of chat messages before
-- they hit any LLM. Default false; users (especially Anwälte under § 9 RAO)
-- can enable it in their profile so personenbezogene Mandantendaten get
-- replaced with placeholders BEFORE the message reaches the AI gateway.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_pseudonymize_chat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.auto_pseudonymize_chat IS
  'If true, chat messages are passed through the pseudonymize-text edge function before being sent to the LLM. Compliance-relevant for RAO § 9 Verschwiegenheitspflicht.';
