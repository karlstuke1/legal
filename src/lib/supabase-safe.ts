// Re-export from the auto-generated client to avoid duplicate GoTrueClient instances.
// All app code imports from here for backward compatibility.
import { supabase } from "@/integrations/supabase/client";

export { supabase };

export const SUPABASE_URL_RESOLVED = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY_RESOLVED = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
