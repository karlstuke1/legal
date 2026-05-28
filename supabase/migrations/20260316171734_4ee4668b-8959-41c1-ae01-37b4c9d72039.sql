-- Change default jurisdiction from DE to AT in all relevant tables
ALTER TABLE public.profiles ALTER COLUMN default_jurisdiction SET DEFAULT '["AT"]'::jsonb;
ALTER TABLE public.chats ALTER COLUMN jurisdiction SET DEFAULT '["AT"]'::jsonb;
ALTER TABLE public.legal_documents ALTER COLUMN jurisdiction SET DEFAULT 'AT';

-- Update existing rows that still have DE defaults
UPDATE public.profiles SET default_jurisdiction = '["AT"]'::jsonb WHERE default_jurisdiction = '["DE"]'::jsonb;
UPDATE public.chats SET jurisdiction = '["AT"]'::jsonb WHERE jurisdiction = '["DE"]'::jsonb;
UPDATE public.legal_documents SET jurisdiction = 'AT' WHERE jurisdiction = 'DE';