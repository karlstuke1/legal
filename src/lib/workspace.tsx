import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-safe";
import { useAuth } from "@/lib/auth";

interface Workspace {
  id: string;
  name: string;
  logo_url: string | null;
  created_by: string;
  created_at: string;
  role: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: () => {},
  loading: true,
  refetch: async () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedForRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    // Deduplicate: don't re-fetch if already fetched for this user
    if (fetchedForRef.current === user.id && workspaces.length > 0) {
      setLoading(false);
      return;
    }

    // Deduplicate concurrent calls
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    setLoading(true);
    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from("workspace_members")
          .select("workspace_id, role, workspaces(id, name, logo_url, created_by, created_at)")
          .eq("user_id", user.id);

        if (error) {
          console.error("Workspace fetch failed:", error);
          setWorkspaces([]);
          return;
        }

        const ws = (data || []).map((d: any) => ({
          ...d.workspaces,
          role: d.role,
        }));

        setWorkspaces(ws);
        fetchedForRef.current = user.id;
        if (!activeId && ws.length > 0) setActiveId(ws[0].id);
      } catch (error) {
        console.error("Unexpected workspace fetch error:", error);
        setWorkspaces([]);
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = promise;
    await promise;
  }, [user, activeId, workspaces.length]);

  useEffect(() => { fetchWorkspaces(); }, [user?.id]);

  const activeWorkspace = workspaces.find((w) => w.id === activeId) || null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspaceId: setActiveId,
        loading,
        refetch: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
