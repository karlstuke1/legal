
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Legal documents table with vector embeddings
CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_provider TEXT NOT NULL, -- 'RIS', 'EURLEX', 'CURIA', 'GII', 'DEJURE', 'FEDLEX', 'FINDOK', 'PARLAMENT', 'UPLOAD'
  source_url TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'DE', -- 'DE', 'AT', 'CH', 'EU'
  doc_ref TEXT, -- e.g. '§ 823 BGB', 'RS0094010', 'ECLI:...'
  doc_date DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding extensions.vector(768),
  chunk_index INTEGER DEFAULT 0,
  parent_doc_id UUID REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate chunks
CREATE UNIQUE INDEX idx_legal_documents_content_hash ON public.legal_documents (content_hash);

-- HNSW index for fast similarity search
CREATE INDEX idx_legal_documents_embedding ON public.legal_documents
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Indexes for filtering
CREATE INDEX idx_legal_documents_jurisdiction ON public.legal_documents (jurisdiction);
CREATE INDEX idx_legal_documents_source_provider ON public.legal_documents (source_provider);
CREATE INDEX idx_legal_documents_workspace ON public.legal_documents (workspace_id);
CREATE INDEX idx_legal_documents_doc_ref ON public.legal_documents (doc_ref);

-- Full-text search index for hybrid search
ALTER TABLE public.legal_documents ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(doc_ref, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content, '')), 'B')
  ) STORED;
CREATE INDEX idx_legal_documents_fts ON public.legal_documents USING gin (fts);

-- Enable RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Global documents (workspace_id IS NULL) are readable by all authenticated users
-- Workspace-specific documents are only readable by workspace members
CREATE POLICY "Anyone can read global legal documents"
  ON public.legal_documents FOR SELECT
  TO authenticated
  USING (workspace_id IS NULL);

CREATE POLICY "Members can read workspace legal documents"
  ON public.legal_documents FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert workspace legal documents"
  ON public.legal_documents FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can delete workspace legal documents"
  ON public.legal_documents FOR DELETE
  TO authenticated
  USING (workspace_id IS NOT NULL AND is_workspace_member(auth.uid(), workspace_id));

-- Service role can insert global documents (for the embedding pipeline)
CREATE POLICY "Service role can manage global documents"
  ON public.legal_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Semantic search function: hybrid vector + full-text
CREATE OR REPLACE FUNCTION public.match_legal_documents(
  query_embedding extensions.vector(768),
  query_text TEXT DEFAULT '',
  match_jurisdiction TEXT DEFAULT NULL,
  match_provider TEXT DEFAULT NULL,
  match_workspace_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  source_provider TEXT,
  source_url TEXT,
  jurisdiction TEXT,
  doc_ref TEXT,
  doc_date DATE,
  metadata JSONB,
  similarity FLOAT,
  fts_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      ld.id,
      ld.title,
      ld.content,
      ld.source_provider,
      ld.source_url,
      ld.jurisdiction,
      ld.doc_ref,
      ld.doc_date,
      ld.metadata,
      1 - (ld.embedding <=> query_embedding) AS sim,
      CASE
        WHEN query_text != '' AND ld.fts @@ plainto_tsquery('german', query_text)
        THEN ts_rank_cd(ld.fts, plainto_tsquery('german', query_text))
        ELSE 0.0
      END AS fts_r
    FROM public.legal_documents ld
    WHERE
      ld.embedding IS NOT NULL
      AND (1 - (ld.embedding <=> query_embedding)) > match_threshold
      AND (match_jurisdiction IS NULL OR ld.jurisdiction = match_jurisdiction)
      AND (match_provider IS NULL OR ld.source_provider = match_provider)
      AND (match_workspace_id IS NULL OR ld.workspace_id IS NULL OR ld.workspace_id = match_workspace_id)
  )
  SELECT
    vr.id,
    vr.title,
    vr.content,
    vr.source_provider,
    vr.source_url,
    vr.jurisdiction,
    vr.doc_ref,
    vr.doc_date,
    vr.metadata,
    vr.sim::FLOAT AS similarity,
    vr.fts_r::FLOAT AS fts_rank,
    (0.7 * vr.sim + 0.3 * LEAST(vr.fts_r * 10, 1.0))::FLOAT AS combined_score
  FROM vector_results vr
  ORDER BY (0.7 * vr.sim + 0.3 * LEAST(vr.fts_r * 10, 1.0)) DESC
  LIMIT match_count;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
