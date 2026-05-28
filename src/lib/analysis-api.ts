import { supabase } from "@/lib/supabase-safe";

export interface MatterAnalysis {
  id: string;
  matter_id: string;
  workspace_id: string;
  type: "flow" | "extraction";
  status: "pending" | "processing" | "done" | "error";
  summary: string | null;
  questions: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisResult {
  id: string;
  analysis_id: string;
  file_id: string;
  file_name_suggestion: string | null;
  doc_date: string | null;
  doc_summary: string | null;
  extracted_data: Record<string, string> | null;
  included: boolean;
  sort_order: number;
  created_at: string;
}

export async function startFlowAnalysis(
  matterId: string,
  workspaceId: string
): Promise<MatterAnalysis | null> {
  const { data, error } = await supabase
    .from("matter_analyses")
    .insert({
      matter_id: matterId,
      workspace_id: workspaceId,
      type: "flow",
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating flow analysis:", error);
    return null;
  }

  const analysis = data as unknown as MatterAnalysis;

  // Trigger edge function (fire and forget)
  supabase.functions.invoke("document-analyze", {
    body: { analysis_id: analysis.id },
  });

  return analysis;
}

export async function startExtractionAnalysis(
  matterId: string,
  workspaceId: string,
  questions: string[]
): Promise<MatterAnalysis | null> {
  const { data, error } = await supabase
    .from("matter_analyses")
    .insert({
      matter_id: matterId,
      workspace_id: workspaceId,
      type: "extraction",
      status: "pending",
      questions,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating extraction analysis:", error);
    return null;
  }

  const analysis = data as unknown as MatterAnalysis;

  supabase.functions.invoke("document-analyze", {
    body: { analysis_id: analysis.id },
  });

  return analysis;
}

export async function fetchAnalyses(matterId: string): Promise<MatterAnalysis[]> {
  const { data, error } = await supabase
    .from("matter_analyses")
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching analyses:", error);
    return [];
  }

  return (data || []) as unknown as MatterAnalysis[];
}

export async function fetchAnalysisResults(analysisId: string): Promise<AnalysisResult[]> {
  const { data, error } = await supabase
    .from("matter_analysis_results")
    .select("*")
    .eq("analysis_id", analysisId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching analysis results:", error);
    return [];
  }

  return (data || []) as unknown as AnalysisResult[];
}

export async function toggleResultIncluded(
  resultId: string,
  included: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("matter_analysis_results")
    .update({ included })
    .eq("id", resultId);

  return !error;
}

export async function updateAnalysisSummary(
  analysisId: string,
  summary: string
): Promise<boolean> {
  const { error } = await supabase
    .from("matter_analyses")
    .update({ summary })
    .eq("id", analysisId);

  return !error;
}

export async function renameFiles(
  results: AnalysisResult[]
): Promise<boolean> {
  const updates = results
    .filter((r) => r.file_name_suggestion && r.included)
    .map((r) =>
      supabase
        .from("files")
        .update({ name: r.file_name_suggestion! })
        .eq("id", r.file_id)
    );

  const settled = await Promise.allSettled(updates);
  return settled.every((s) => s.status === "fulfilled");
}
