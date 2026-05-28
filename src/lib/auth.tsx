import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-safe";
import { logAudit } from "@/lib/audit";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      try {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        // Audit auth events
        if (event === "SIGNED_IN" && nextSession?.user) {
          logAudit({ action: "login", metadata: { method: "session" } });
        } else if (event === "SIGNED_OUT") {
          logAudit({ action: "logout" });
        } else if (event === "PASSWORD_RECOVERY") {
          logAudit({ action: "password_reset" });
        }
      } catch (error) {
        console.error("Auth state update failed:", error);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    supabase.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      })
      .catch((error) => {
        console.error("Initial session load failed:", error);
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
