
-- Backfill: Create free plans for all existing workspaces that don't have one
INSERT INTO public.plans (workspace_id, plan, monthly_queries_limit, monthly_uploads_limit, monthly_pseudonymizations_limit, seats_limit)
SELECT w.id, 'free', 25, 5, 5, 2
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.workspace_id = w.id);
