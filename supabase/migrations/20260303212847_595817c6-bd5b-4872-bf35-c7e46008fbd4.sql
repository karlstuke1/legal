
ALTER TABLE public.profiles
ADD COLUMN custom_instructions text DEFAULT '',
ADD COLUMN response_style text DEFAULT '';
