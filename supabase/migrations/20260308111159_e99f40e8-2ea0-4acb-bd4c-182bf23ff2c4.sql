-- Create cleanup function for audit logs older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '90 days';
$$;

-- Create cleanup function for usage ledger older than 6 months (keep for billing)
CREATE OR REPLACE FUNCTION public.cleanup_old_usage_ledger()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.usage_ledger WHERE created_at < now() - interval '6 months';
$$;

-- Create cleanup function for retrieval logs older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_retrieval_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.retrieval_logs WHERE created_at < now() - interval '30 days';
$$;