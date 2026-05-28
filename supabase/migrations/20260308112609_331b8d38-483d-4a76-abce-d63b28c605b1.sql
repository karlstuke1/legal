-- Update existing free plans to new limits (only if they still have old defaults)
UPDATE public.plans 
SET 
  monthly_queries_limit = 25,
  monthly_uploads_limit = 5,
  monthly_pseudonymizations_limit = 5,
  seats_limit = 2
WHERE plan = 'free' 
  AND monthly_queries_limit = 500;