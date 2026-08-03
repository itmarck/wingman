ALTER TABLE entries RENAME TO core_entries;
ALTER TABLE items RENAME TO core_items;
ALTER TABLE component_revisions RENAME TO core_components;
ALTER TABLE states RENAME TO core_assertions;

ALTER TABLE interpretations RENAME TO interpretation_runs;
ALTER TABLE reviews RENAME TO interpretation_reviews;
ALTER TABLE interpretation_review_completions RENAME TO interpretation_review_locks;
ALTER TABLE workflow_outcomes RENAME TO interpretation_workflow_outcomes;

ALTER TABLE intents RENAME TO execution_intents;
ALTER TABLE attempts RENAME TO execution_attempts;
ALTER TABLE events RENAME TO execution_events;

ALTER TABLE rules RENAME TO automation_rules;
ALTER TABLE rule_deduplication_keys RENAME TO automation_rule_deduplications;
ALTER TABLE rule_evaluation_results RENAME TO automation_rule_evaluations;
ALTER TABLE reminders RENAME TO automation_reminders;
ALTER TABLE proactive_proposals RENAME TO automation_suggestions;

ALTER INDEX entries_origin_external_id RENAME TO core_entries_origin_external_id;
ALTER INDEX entries_captured_at RENAME TO core_entries_captured_at;
ALTER INDEX items_profile RENAME TO core_items_profile;
ALTER INDEX component_revisions_item RENAME TO core_components_item;
ALTER INDEX component_revisions_current RENAME TO core_components_current;
ALTER INDEX component_revisions_name RENAME TO core_components_name;
ALTER INDEX component_revisions_value RENAME TO core_components_value;
ALTER INDEX states_modality RENAME TO core_assertions_modality;

ALTER INDEX interpretations_entry_history RENAME TO interpretation_runs_entry_history;
ALTER INDEX interpretations_available RENAME TO interpretation_runs_available;
ALTER INDEX interpretations_expired_lease RENAME TO interpretation_runs_expired_lease;
ALTER INDEX reviews_interpretation_reference RENAME TO interpretation_reviews_reference;
ALTER INDEX reviews_pending RENAME TO interpretation_reviews_pending;
ALTER INDEX reviews_entry_pending RENAME TO interpretation_reviews_entry_pending;
ALTER INDEX workflow_outcomes_recorded RENAME TO interpretation_workflow_outcomes_recorded;

ALTER INDEX intents_status RENAME TO execution_intents_status;
ALTER INDEX intents_capability RENAME TO execution_intents_capability;
ALTER INDEX attempts_idempotency_key RENAME TO execution_attempts_idempotency_key;
ALTER INDEX events_key RENAME TO execution_events_key;
ALTER INDEX events_intent RENAME TO execution_events_intent;

ALTER INDEX rules_due RENAME TO automation_rules_due;
ALTER INDEX rules_event_trigger RENAME TO automation_rules_event_trigger;
ALTER INDEX rules_trigger RENAME TO automation_rules_trigger;
ALTER INDEX rule_evaluation_results_rule RENAME TO automation_rule_evaluations_rule;
ALTER INDEX reminders_status RENAME TO automation_reminders_status;
ALTER INDEX reminders_subject RENAME TO automation_reminders_subject;
ALTER INDEX proactive_proposals_status RENAME TO automation_suggestions_status;
