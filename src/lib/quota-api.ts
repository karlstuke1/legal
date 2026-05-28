import { supabase } from "@/lib/supabase-safe";

export interface WorkspaceQuota {
  plan: string;
  queriesLimit: number;
  queriesUsed: number;
  uploadsLimit: number;
  uploadsUsed: number;
  pseudonymizationsLimit: number;
  pseudonymizationsUsed: number;
}

export async function fetchQuota(workspaceId: string): Promise<WorkspaceQuota | null> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStart = startOfMonth.toISOString();

  const [planRes, queriesRes, uploadsRes, pseudoRes] = await Promise.all([
    supabase
      .from("plans")
      .select("plan, monthly_queries_limit, monthly_uploads_limit, monthly_pseudonymizations_limit")
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart),
    supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart),
    supabase
      .from("pseudonymization_logs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart),
  ]);

  if (planRes.error || !planRes.data) return null;

  const plan = planRes.data as any;

  return {
    plan: plan.plan,
    queriesLimit: plan.monthly_queries_limit,
    queriesUsed: queriesRes.count || 0,
    uploadsLimit: plan.monthly_uploads_limit,
    uploadsUsed: uploadsRes.count || 0,
    pseudonymizationsLimit: plan.monthly_pseudonymizations_limit,
    pseudonymizationsUsed: pseudoRes.count || 0,
  };
}

