
ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;

-- Set existing users as already onboarded
UPDATE public.profiles SET onboarding_completed = true;
