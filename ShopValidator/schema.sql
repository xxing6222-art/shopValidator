-- Required production persistence for 店判 2.1.
-- Local development can use the in-memory fallback, but the production Queue
-- requires D1 to preserve cumulative search state between analysis rounds.

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  stage TEXT,
  location_json TEXT,
  case_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  selected_plan_id TEXT,
  tts_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  case_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value_json TEXT,
  range_json TEXT,
  unit TEXT,
  period TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence TEXT NOT NULL,
  transcript TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (case_id, fact_id),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interview_turns (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  field_name TEXT,
  question TEXT,
  transcript TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  case_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  progress_json TEXT,
  result_json TEXT,
  state_json TEXT,
  warning TEXT,
  claim_token TEXT,
  claimed_round INTEGER,
  claim_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facts_case ON facts(case_id);
CREATE INDEX IF NOT EXISTS idx_turns_case ON interview_turns(case_id);
CREATE INDEX IF NOT EXISTS idx_runs_case ON analysis_runs(case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_case_version ON analysis_runs(case_id, case_version);

-- Public leaderboard rows are deliberately separate from the private 24-hour
-- case archive. snapshot_json never contains address, identity, transcript,
-- token, audio URL or raw accounting values.
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
