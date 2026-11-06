-- DocPilot schema. Runs automatically on API boot (idempotent).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  source_type  text NOT NULL CHECK (source_type IN ('file', 'url', 'text')),
  source_uri   text,
  raw_text     text,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  progress     int  NOT NULL DEFAULT 0,
  error        text,
  chunk_count  int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents (workspace_id);

CREATE TABLE IF NOT EXISTS chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal      int  NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536) NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX IF NOT EXISTS chunks_workspace_idx ON chunks (workspace_id);
CREATE INDEX IF NOT EXISTS chunks_document_idx  ON chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx       ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS query_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question          text NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int  NOT NULL DEFAULT 0,
  completion_tokens int  NOT NULL DEFAULT 0,
  cost_usd          numeric(12, 6) NOT NULL DEFAULT 0,
  latency_ms        int  NOT NULL DEFAULT 0,
  tool_calls        int  NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS query_logs_workspace_idx ON query_logs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  total          int NOT NULL,
  hit_rate       numeric(5, 4) NOT NULL,
  mrr            numeric(5, 4) NOT NULL,
  avg_latency_ms int NOT NULL,
  details        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
