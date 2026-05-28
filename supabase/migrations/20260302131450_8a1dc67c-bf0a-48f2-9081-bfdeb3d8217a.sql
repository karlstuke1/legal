-- Add explicit deny policies to rate_limit_log to satisfy RLS linter
-- This table is only accessed via service role in edge functions
CREATE POLICY "No direct select access" ON public.rate_limit_log FOR SELECT USING (false);
CREATE POLICY "No direct insert access" ON public.rate_limit_log FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update access" ON public.rate_limit_log FOR UPDATE USING (false);
CREATE POLICY "No direct delete access" ON public.rate_limit_log FOR DELETE USING (false);