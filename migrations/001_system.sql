CREATE TABLE core_entries (
  id text PRIMARY KEY,
  content_kind text NOT NULL CHECK (content_kind IN ('text', 'url')),
  content_value text NOT NULL CHECK (btrim(content_value) <> ''),
  source text NOT NULL CHECK (btrim(source) <> ''),
  external_id text CHECK (external_id IS NULL OR btrim(external_id) <> ''),
  captured_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX core_entries_origin_external_id
  ON core_entries (source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX core_entries_captured_at
  ON core_entries (captured_at DESC, id DESC);

CREATE TABLE core_items (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  profile_key text CHECK (
    profile_key IS NULL OR profile_key ~ '^[a-z][A-Za-z0-9]*$'
  ),
  profile_version integer CHECK (profile_version IS NULL OR profile_version > 0),
  CHECK ((profile_key IS NULL) = (profile_version IS NULL))
);

CREATE INDEX core_items_profile
  ON core_items (profile_key, profile_version)
  WHERE profile_key IS NOT NULL;

CREATE TABLE core_component_revisions (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES core_items (id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (key ~ '^[a-z][A-Za-z0-9]*$'),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  value jsonb NOT NULL,
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  recorded_at timestamptz NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  status text NOT NULL CHECK (status IN ('accepted', 'candidate', 'rejected')),
  supersedes_revision_id text REFERENCES core_component_revisions (id) ON DELETE RESTRICT,
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to),
  CHECK (supersedes_revision_id IS NULL OR supersedes_revision_id <> id)
);

CREATE INDEX core_component_revisions_item
  ON core_component_revisions (item_id, key, recorded_at DESC, id DESC);
CREATE INDEX core_component_revisions_current
  ON core_component_revisions (item_id, key, recorded_at DESC, id DESC)
  WHERE status = 'accepted';
CREATE INDEX core_component_revisions_value
  ON core_component_revisions USING gin (value jsonb_path_ops);

CREATE TABLE core_states (
  id text PRIMARY KEY,
  modality text NOT NULL CHECK (
    modality IN ('observed', 'believed', 'desired', 'required', 'forbidden', 'predicted')
  ),
  condition jsonb NOT NULL CHECK (jsonb_typeof(condition) = 'object'),
  author_kind text NOT NULL CHECK (author_kind IN ('user', 'system', 'inference')),
  author_id text CHECK (author_id IS NULL OR btrim(author_id) <> ''),
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  recorded_at timestamptz NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence double precision CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to)
);

CREATE INDEX core_states_modality
  ON core_states (modality, recorded_at DESC, id DESC);
CREATE INDEX core_states_condition
  ON core_states USING gin (condition jsonb_path_ops);

CREATE TABLE interpretation_runs (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES core_entries (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (
    status IN ('queued', 'processing', 'pending', 'completed', 'failed', 'exhausted')
  ),
  attempts integer NOT NULL CHECK (attempts >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
  available_at timestamptz,
  interpreter_key text CHECK (interpreter_key IS NULL OR btrim(interpreter_key) <> ''),
  draft jsonb CHECK (draft IS NULL OR jsonb_typeof(draft) = 'object'),
  publication jsonb CHECK (publication IS NULL OR jsonb_typeof(publication) = 'object'),
  error text CHECK (error IS NULL OR btrim(error) <> ''),
  claim_id text CHECK (claim_id IS NULL OR btrim(claim_id) <> ''),
  lease_until timestamptz,
  CHECK ((status = 'queued' AND available_at IS NOT NULL) OR (status <> 'queued' AND available_at IS NULL)),
  CHECK (status = 'queued' OR attempts > 0),
  CHECK (status <> 'pending' OR (draft IS NOT NULL AND interpreter_key IS NOT NULL)),
  CHECK (status <> 'completed' OR (publication IS NOT NULL AND interpreter_key IS NOT NULL)),
  CHECK (status NOT IN ('failed', 'exhausted') OR error IS NOT NULL),
  CHECK (status = 'completed' OR publication IS NULL),
  CHECK (status IN ('queued', 'failed', 'exhausted') OR error IS NULL),
  CHECK ((claim_id IS NULL) = (lease_until IS NULL)),
  CHECK (claim_id IS NULL OR status = 'processing')
);

CREATE INDEX interpretation_runs_entry_history
  ON interpretation_runs (entry_id, created_at DESC, id DESC);
CREATE INDEX interpretation_runs_available
  ON interpretation_runs (available_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX interpretation_runs_expired_lease
  ON interpretation_runs (lease_until, created_at, id)
  WHERE status = 'processing';

CREATE TABLE interpretation_reviews (
  id text PRIMARY KEY,
  interpretation_id text NOT NULL REFERENCES interpretation_runs (id) ON DELETE RESTRICT,
  entry_id text NOT NULL REFERENCES core_entries (id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind = 'referenceResolution'),
  status text NOT NULL CHECK (status IN ('pending', 'resolved')),
  resolution jsonb NOT NULL CHECK (
    jsonb_typeof(resolution) = 'object' AND btrim(resolution ->> 'reference') <> ''
  ),
  decision jsonb CHECK (decision IS NULL OR jsonb_typeof(decision) = 'object'),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz CHECK (resolved_at IS NULL OR resolved_at >= created_at),
  CHECK (
    (status = 'pending' AND decision IS NULL AND resolved_at IS NULL) OR
    (status = 'resolved' AND decision IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX interpretation_reviews_reference
  ON interpretation_reviews (interpretation_id, (resolution ->> 'reference'));
CREATE INDEX interpretation_reviews_pending
  ON interpretation_reviews (created_at, id)
  WHERE status = 'pending';
CREATE INDEX interpretation_reviews_entry_pending
  ON interpretation_reviews (entry_id, created_at, id)
  WHERE status = 'pending';

CREATE TABLE interpretation_review_locks (
  interpretation_id text PRIMARY KEY REFERENCES interpretation_runs (id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL
);

CREATE TABLE execution_intents (
  id text PRIMARY KEY,
  capability_key text NOT NULL CHECK (capability_key ~ '^[a-z][A-Za-z0-9]*$'),
  capability_version integer NOT NULL CHECK (capability_version > 0),
  input jsonb NOT NULL,
  proposer jsonb NOT NULL CHECK (jsonb_typeof(proposer) = 'object'),
  conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'array'),
  expected_state jsonb NOT NULL CHECK (jsonb_typeof(expected_state) = 'array'),
  consent text NOT NULL CHECK (consent IN ('none', 'explicit')),
  trigger jsonb CHECK (trigger IS NULL OR jsonb_typeof(trigger) = 'object'),
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'consented', 'cancelled', 'completed'))
);

CREATE INDEX execution_intents_status
  ON execution_intents (status, created_at, id);
CREATE INDEX execution_intents_capability
  ON execution_intents (capability_key, capability_version, created_at DESC);

CREATE TABLE execution_attempts (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES execution_intents (id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence > 0),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  started_at timestamptz NOT NULL,
  finished_at timestamptz CHECK (finished_at IS NULL OR finished_at >= started_at),
  outcome text NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed', 'uncertain')),
  output jsonb,
  message text CHECK (message IS NULL OR btrim(message) <> ''),
  UNIQUE (intent_id, sequence),
  CHECK (
    (outcome = 'started' AND finished_at IS NULL) OR
    (outcome <> 'started' AND finished_at IS NOT NULL)
  )
);

CREATE INDEX execution_attempts_intent
  ON execution_attempts (intent_id, sequence);
CREATE INDEX execution_attempts_idempotency
  ON execution_attempts (idempotency_key, started_at, id);
CREATE UNIQUE INDEX execution_attempts_active
  ON execution_attempts (intent_id)
  WHERE outcome = 'started';

CREATE TABLE execution_events (
  id text PRIMARY KEY,
  key text NOT NULL CHECK (key ~ '^[a-z][A-Za-z0-9]*$'),
  occurred_at timestamptz NOT NULL,
  intent_id text REFERENCES execution_intents (id) ON DELETE RESTRICT,
  attempt_id text REFERENCES execution_attempts (id) ON DELETE RESTRICT,
  entry_id text REFERENCES core_entries (id) ON DELETE RESTRICT,
  data jsonb NOT NULL,
  CHECK (intent_id IS NOT NULL OR attempt_id IS NOT NULL OR entry_id IS NOT NULL)
);

CREATE INDEX execution_events_key
  ON execution_events (key, occurred_at, id);
CREATE INDEX execution_events_intent
  ON execution_events (intent_id, occurred_at, id)
  WHERE intent_id IS NOT NULL;

CREATE TABLE automation_definitions (
  id text PRIMARY KEY,
  subjects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(subjects) = 'array'),
  given_conditions jsonb NOT NULL CHECK (jsonb_typeof(given_conditions) = 'array'),
  trigger jsonb NOT NULL CHECK (jsonb_typeof(trigger) = 'object'),
  then_intents jsonb NOT NULL CHECK (
    jsonb_typeof(then_intents) = 'array' AND jsonb_array_length(then_intents) > 0
  ),
  controls jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(controls) = 'object'),
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'stopped')),
  next_evaluation_at timestamptz,
  last_produced_at timestamptz,
  occurrences integer NOT NULL DEFAULT 0 CHECK (occurrences >= 0)
);

CREATE INDEX automation_definitions_due
  ON automation_definitions (next_evaluation_at, id)
  WHERE status = 'active' AND next_evaluation_at IS NOT NULL;
CREATE INDEX automation_definitions_event_trigger
  ON automation_definitions ((trigger ->> 'eventKey'), id)
  WHERE status = 'active' AND trigger -> 'operator' ->> 'key' = 'event';
CREATE INDEX automation_definitions_trigger
  ON automation_definitions USING gin (trigger jsonb_path_ops);

CREATE TABLE automation_deduplications (
  automation_id text NOT NULL REFERENCES automation_definitions (id) ON DELETE CASCADE,
  deduplication_id text NOT NULL CHECK (btrim(deduplication_id) <> ''),
  PRIMARY KEY (automation_id, deduplication_id)
);

CREATE TABLE automation_evaluations (
  id text PRIMARY KEY,
  automation_id text NOT NULL REFERENCES automation_definitions (id) ON DELETE RESTRICT,
  trigger_id text NOT NULL CHECK (btrim(trigger_id) <> ''),
  evaluated_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (
    outcome IN ('produced', 'givenFalse', 'stopped', 'expired', 'cooldown', 'duplicate')
  ),
  intent_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason text NOT NULL CHECK (btrim(reason) <> '')
);

CREATE INDEX automation_evaluations_automation
  ON automation_evaluations (automation_id, evaluated_at, id);

CREATE TABLE interpretation_declaration_outcomes (
  entry_id text NOT NULL REFERENCES core_entries (id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (btrim(reference) <> ''),
  kind text NOT NULL CHECK (kind IN ('item', 'state', 'automation', 'intent')),
  status text NOT NULL CHECK (status IN ('applied', 'needsInput', 'unsupported', 'failed')),
  target_id text CHECK (target_id IS NULL OR btrim(target_id) <> ''),
  reason text CHECK (reason IS NULL OR btrim(reason) <> ''),
  details jsonb,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (entry_id, reference)
);

CREATE INDEX interpretation_declaration_outcomes_recorded
  ON interpretation_declaration_outcomes (recorded_at DESC, entry_id);

CREATE TABLE proactivity_suggestions (
  id text PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE CHECK (btrim(fingerprint) <> ''),
  detector_key text NOT NULL CHECK (detector_key ~ '^[a-z][A-Za-z0-9]*$'),
  detector_version integer NOT NULL CHECK (detector_version > 0),
  subject_item_id text REFERENCES core_items (id) ON DELETE RESTRICT,
  relevant_state text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  rationale text NOT NULL CHECK (btrim(rationale) <> ''),
  expected_effect text NOT NULL CHECK (btrim(expected_effect) <> ''),
  urgency text NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  expires_at timestamptz NOT NULL,
  capability_key text NOT NULL CHECK (capability_key ~ '^[a-z][A-Za-z0-9]*$'),
  capability_version integer NOT NULL CHECK (capability_version > 0),
  autonomy jsonb NOT NULL CHECK (jsonb_typeof(autonomy) = 'object'),
  intent_id text REFERENCES execution_intents (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (
    status IN (
      'active', 'accepted', 'rejected', 'modified', 'postponed',
      'expired', 'completed', 'unsupported'
    )
  ),
  created_at timestamptz NOT NULL,
  feedback jsonb NOT NULL CHECK (jsonb_typeof(feedback) = 'array')
);

CREATE INDEX proactivity_suggestions_status
  ON proactivity_suggestions (status, expires_at, created_at, id);
