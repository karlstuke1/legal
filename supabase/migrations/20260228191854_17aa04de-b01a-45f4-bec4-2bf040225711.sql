
-- Recreate all missing triggers for onboarding flow

-- 1. Profile creation on new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Workspace creation on new user signup
CREATE OR REPLACE TRIGGER on_auth_user_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();

-- 3. Plan creation on new workspace
CREATE OR REPLACE TRIGGER on_workspace_created_plan
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace_plan();

-- 4. Updated_at trigger for profiles
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Updated_at trigger for matter_notes
CREATE OR REPLACE TRIGGER update_matter_notes_updated_at
  BEFORE UPDATE ON public.matter_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
