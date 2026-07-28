CREATE SCHEMA telemetry;

CREATE TABLE telemetry.runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interpretation_id text NOT NULL,
  operation text NOT NULL CHECK (btrim(operation) <> ''),
  reasoning text NOT NULL CHECK (reasoning IN ('low', 'high')),
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  requested_model text NOT NULL CHECK (btrim(requested_model) <> ''),
  used_model text NOT NULL CHECK (btrim(used_model) <> ''),
  instructions_version text NOT NULL CHECK (btrim(instructions_version) <> ''),
  attempt integer NOT NULL CHECK (attempt > 0),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  result text NOT NULL CHECK (result IN ('empty', 'error', 'invalid', 'knowledge')),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost_usd numeric(16, 8) CHECK (
    estimated_cost_usd IS NULL OR estimated_cost_usd >= 0
  ),
  error_category text CHECK (error_category IS NULL OR btrim(error_category) <> ''),
  created_at timestamptz NOT NULL,
  CHECK (
    (result = 'error' AND error_category IS NOT NULL) OR
    (result <> 'error' AND error_category IS NULL)
  )
);

CREATE INDEX inference_runs_interpretation
  ON telemetry.runs (interpretation_id, created_at DESC);

CREATE INDEX inference_runs_created_at
  ON telemetry.runs (created_at DESC);
