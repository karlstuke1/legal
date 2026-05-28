
CREATE TABLE public.message_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON public.message_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON public.message_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
  ON public.message_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback"
  ON public.message_feedback FOR DELETE
  USING (auth.uid() = user_id);
