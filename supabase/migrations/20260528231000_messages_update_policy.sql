CREATE POLICY "Members can update messages"
ON public.messages
FOR UPDATE
USING (public.is_chat_member(auth.uid(), chat_id))
WITH CHECK (public.is_chat_member(auth.uid(), chat_id));
