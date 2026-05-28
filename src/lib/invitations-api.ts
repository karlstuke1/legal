import { supabase } from "@/lib/supabase-safe";

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invited_by: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export async function fetchInvitations(workspaceId: string) {
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Invitation[];
}

export async function sendInvitation(workspaceId: string, email: string, role: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await supabase.functions.invoke("invite-member", {
    body: { workspace_id: workspaceId, email, role },
  });
  if (res.error) throw res.error;
  return res.data;
}

export async function revokeInvitation(invitationId: string) {
  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", invitationId);
  if (error) throw error;
}

export async function getInvitationByToken(token: string) {
  // Use edge function to validate token (public access)
  const res = await supabase.functions.invoke("invite-member", {
    body: { action: "validate", token },
  });
  if (res.error) throw res.error;
  return res.data as { invitation: Invitation; workspace_name: string };
}

export async function acceptInvitation(token: string) {
  const res = await supabase.functions.invoke("invite-member", {
    body: { action: "accept", token },
  });
  if (res.error) throw res.error;
  return res.data;
}

export async function fetchWorkspaceMembers(workspaceId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return data || [];
}

export async function updateMemberRole(memberId: string, role: "owner" | "admin" | "member" | "viewer") {
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string) {
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}
