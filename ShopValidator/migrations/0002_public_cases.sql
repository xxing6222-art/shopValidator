CREATE TABLE IF NOT EXISTS public_cases (
  id TEXT PRIMARY KEY,
  source_case_id TEXT NOT NULL,
  manage_token_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  data_score REAL NOT NULL,
  outcome_score REAL NOT NULL DEFAULT 0,
  rank_score REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public_case_outcomes (
  id TEXT PRIMARY KEY,
  public_case_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  before_value REAL NOT NULL,
  after_value REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (public_case_id) REFERENCES public_cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_public_cases_rank ON public_cases(is_active, rank_score DESC, updated_at DESC);
