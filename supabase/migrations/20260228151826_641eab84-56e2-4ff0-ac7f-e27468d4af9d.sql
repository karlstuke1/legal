
-- Trigger 1: Auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger 2: Auto-create workspace + membership on signup
CREATE OR REPLACE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();

-- Trigger 3: Auto-create free plan when a new workspace is created
CREATE OR REPLACE FUNCTION public.handle_new_workspace_plan()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.plans (workspace_id, plan, monthly_queries_limit, monthly_uploads_limit, monthly_pseudonymizations_limit, seats_limit)
  VALUES (NEW.id, 'free', 25, 5, 5, 2)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_workspace_created_plan
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace_plan();

-- Trigger 4: updated_at for profiles
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger 5: updated_at for matter_notes
CREATE OR REPLACE TRIGGER update_matter_notes_updated_at
  BEFORE UPDATE ON public.matter_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger 6: updated_at for matter_analyses
CREATE OR REPLACE TRIGGER update_matter_analyses_updated_at
  BEFORE UPDATE ON public.matter_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
