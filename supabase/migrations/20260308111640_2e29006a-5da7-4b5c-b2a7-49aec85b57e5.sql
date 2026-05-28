-- Update handle_new_workspace_plan to use 'free' plan defaults
-- Free plan: 25 queries, 5 uploads, 5 pseudonymizations, 2 seats

-- Define plan configurations as comments for reference:
-- free: 25 queries, 5 uploads, 5 pseudonymizations, 2 seats, 0€
-- student: 100 queries, 25 uploads, 15 pseudonymizations, 1 seat, 19€
-- starter: 300 queries, 75 uploads, 40 pseudonymizations, 3 seats, 49€
-- professional: 1000 queries, 250 uploads, 150 pseudonymizations, 10 seats, 99€
-- enterprise: unlimited (999999), unlimited seats, custom pricing

CREATE OR REPLACE FUNCTION public.handle_new_workspace_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.plans (
    workspace_id, 
    plan, 
    monthly_queries_limit, 
    monthly_uploads_limit, 
    monthly_pseudonymizations_limit, 
    seats_limit
  )
  VALUES (NEW.id, 'free', 25, 5, 5, 2)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;