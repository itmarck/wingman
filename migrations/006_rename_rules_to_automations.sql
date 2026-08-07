ALTER TABLE telemetry.runs DROP COLUMN instructions_version;

ALTER TABLE automation_rules RENAME TO automation_definitions;
ALTER TABLE automation_rule_deduplications RENAME TO automation_deduplications;
ALTER TABLE automation_rule_evaluations RENAME TO automation_evaluations;

ALTER TABLE automation_deduplications RENAME COLUMN rule_id TO automation_id;
ALTER TABLE automation_evaluations RENAME COLUMN rule_id TO automation_id;
ALTER TABLE automation_reminders RENAME COLUMN rule_ids TO automation_ids;

ALTER INDEX automation_rules_due RENAME TO automation_definitions_due;
ALTER INDEX automation_rules_event_trigger RENAME TO automation_definitions_event_trigger;
ALTER INDEX automation_rules_trigger RENAME TO automation_definitions_trigger;
ALTER INDEX automation_rule_evaluations_rule RENAME TO automation_evaluations_automation;
