DROP TABLE IF EXISTS automation_reminders;

ALTER TABLE interpretation_workflow_outcomes
  DROP CONSTRAINT IF EXISTS workflow_outcomes_kind_check;
ALTER TABLE interpretation_workflow_outcomes
  DROP CONSTRAINT IF EXISTS interpretation_workflow_outcomes_kind_check;
ALTER TABLE interpretation_workflow_outcomes
  RENAME TO interpretation_declaration_outcomes;
ALTER TABLE interpretation_declaration_outcomes
  ADD CONSTRAINT interpretation_declaration_outcomes_kind_check
  CHECK (kind IN ('item', 'state', 'automation', 'intent'));
ALTER INDEX interpretation_workflow_outcomes_recorded
  RENAME TO interpretation_declaration_outcomes_recorded;

ALTER TABLE automation_definitions
  ADD COLUMN subjects jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(subjects) = 'array');
