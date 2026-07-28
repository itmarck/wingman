ALTER TABLE telemetry.runs
  ADD COLUMN target text;

UPDATE telemetry.runs
SET target = provider || '.legacy';

ALTER TABLE telemetry.runs
  ALTER COLUMN target SET NOT NULL,
  ADD CHECK (btrim(target) <> '');

CREATE INDEX inference_runs_target
  ON telemetry.runs (target, created_at DESC);
