-- Allow admins to read all feedback
CREATE POLICY "Admins can read all feedback"
  ON public.message_feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
