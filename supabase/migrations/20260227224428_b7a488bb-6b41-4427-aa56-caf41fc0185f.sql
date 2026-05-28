
-- Fix overly permissive INSERT policies on retrieval_logs and usage_ledger
DROP POLICY "System can insert retrieval logs" ON public.retrieval_logs;
CREATE POLICY "Authenticated can insert retrieval logs" ON public.retrieval_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "System can insert usage" ON public.usage_ledger;
CREATE POLICY "Authenticated can insert usage" ON public.usage_ledger FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
