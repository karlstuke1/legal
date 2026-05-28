import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-safe";
import { useAuth } from "@/lib/auth";

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const loadAdminState = async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (error) {
          console.error("Admin role check failed:", error);
          if (isMounted) setIsAdmin(false);
          return;
        }

        if (isMounted) setIsAdmin(!!data);
      } catch (error) {
        console.error("Unexpected admin role check error:", error);
        if (isMounted) setIsAdmin(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAdminState();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return { isAdmin, loading };
}
