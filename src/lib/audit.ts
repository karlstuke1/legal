import { supabase } from "@/lib/supabase-safe";

export type AuditAction =
  | "login"
  | "logout"
  | "signup"
  | "password_reset"
  | "profile_update"
  | "data_export"
  | "account_delete"
  | "chat_create"
  | "chat_delete"
  | "file_upload"
  | "file_delete"
  | "matter_create"
  | "matter_delete"
  | "member_invite"
  | "member_remove"
  | "pseudonymization";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  login: "Anmeldung",
  logout: "Abmeldung",
  signup: "Registrierung",
  password_reset: "Passwort zurückgesetzt",
  profile_update: "Profil aktualisiert",
  data_export: "Datenexport (Art. 20)",
  account_delete: "Konto gelöscht",
  chat_create: "Chat erstellt",
  chat_delete: "Chat gelöscht",
  file_upload: "Datei hochgeladen",
  file_delete: "Datei gelöscht",
  matter_create: "Akte erstellt",
  matter_delete: "Akte gelöscht",
  member_invite: "Mitglied eingeladen",
  member_remove: "Mitglied entfernt",
  pseudonymization: "Pseudonymisierung",
};

export const AUDIT_ACTION_CATEGORIES: Record<string, AuditAction[]> = {
  "Authentifizierung": ["login", "logout", "signup", "password_reset"],
  "Datenschutz": ["data_export", "account_delete", "profile_update", "pseudonymization"],
  "Daten": ["chat_create", "chat_delete", "file_upload", "file_delete", "matter_create", "matter_delete"],
  "Team": ["member_invite", "member_remove"],
};

interface AuditLogParams {
  action: AuditAction;
  workspaceId?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a GDPR-relevant action to the audit trail.
 * Fire-and-forget — never blocks the caller.
 */
export function logAudit({ action, workspaceId, resourceType, resourceId, metadata }: AuditLogParams) {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        workspace_id: workspaceId || null,
        action,
        resource_type: resourceType || null,
        resource_id: resourceId || null,
        metadata: metadata || {},
      } as any);
    } catch (e) {
      console.error("[audit] Failed to log:", e);
    }
  })();
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  workspace_id: string | null;
  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function fetchAuditLogs(workspaceId: string, limit = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit) as any;

  if (error) {
    console.error("[audit] Fetch failed:", error);
    return [];
  }
  return data || [];
}
