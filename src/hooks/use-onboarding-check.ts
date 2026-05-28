import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useOnboardingCheck() {
  const { user } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkOnboarding = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Onboarding check failed:", error);
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(!(data as any)?.onboarding_completed);
      }
    } catch {
      setNeedsOnboarding(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  const markComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  return { needsOnboarding, loading, markComplete, refetch: checkOnboarding };
}
