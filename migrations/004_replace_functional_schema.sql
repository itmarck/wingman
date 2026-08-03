DROP TABLE IF EXISTS proactive_proposals CASCADE;
DROP TABLE IF EXISTS workflow_outcomes CASCADE;
DROP TABLE IF EXISTS reminders CASCADE;
DROP TABLE IF EXISTS rule_evaluation_results CASCADE;
DROP TABLE IF EXISTS rule_deduplication_keys CASCADE;
DROP TABLE IF EXISTS rules CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS intents CASCADE;
DROP TABLE IF EXISTS states CASCADE;
DROP TABLE IF EXISTS interpretation_review_completions CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS interpretations CASCADE;
DROP TABLE IF EXISTS component_revisions CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS axioms CASCADE;
DROP TABLE IF EXISTS aliases CASCADE;
DROP TABLE IF EXISTS predicates CASCADE;
DROP TABLE IF EXISTS concepts CASCADE;
DROP TABLE IF EXISTS entries CASCADE;

CREATE TABLE entries (
  id text PRIMARY KEY,
  content_kind text NOT NULL CHECK (content_kind IN ('text', 'url')),
  content_value text NOT NULL CHECK (btrim(content_value) <> ''),
  source text NOT NULL CHECK (btrim(source) <> ''),
  external_id text CHECK (external_id IS NULL OR btrim(external_id) <> ''),
  captured_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX entries_origin_external_id
  ON entries (source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX entries_captured_at ON entries (captured_at DESC, id DESC);

CREATE TABLE items (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  profile_key text CHECK (profile_key IS NULL OR btrim(profile_key) <> ''),
  profile_version integer CHECK (profile_version IS NULL OR profile_version > 0),
  CHECK ((profile_key IS NULL) = (profile_version IS NULL))
);

CREATE INDEX items_profile ON items (profile_key, profile_version)
  WHERE profile_key IS NOT NULL;

CREATE TABLE component_revisions (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (btrim(key) <> ''),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  value jsonb NOT NULL,
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  recorded_at timestamptz NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  status text NOT NULL CHECK (status IN ('accepted', 'candidate', 'rejected')),
  supersedes_revision_id text REFERENCES component_revisions (id) ON DELETE RESTRICT,
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to),
  CHECK (supersedes_revision_id IS NULL OR supersedes_revision_id <> id)
);

CREATE INDEX component_revisions_item
  ON component_revisions (item_id, key, recorded_at DESC, id DESC);
CREATE INDEX component_revisions_current
  ON component_revisions (item_id, key)
  WHERE status = 'accepted';
CREATE INDEX component_revisions_name
  ON component_revisions (lower(btrim(value #>> '{}')))
  WHERE key = 'name' AND status = 'accepted' AND jsonb_typeof(value) = 'string';
CREATE INDEX component_revisions_value
  ON component_revisions USING gin (value jsonb_path_ops);

CREATE TABLE interpretations (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES entries (id) ON DELETE RESTRICT,
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
  CHECK ((claim_id IS NULL AND lease_until IS NULL) OR (claim_id IS NOT NULL AND lease_until IS NOT NULL))
);

CREATE INDEX interpretations_entry_history
  ON interpretations (entry_id, created_at DESC, id DESC);
CREATE INDEX interpretations_available
  ON interpretations (available_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX interpretations_expired_lease
  ON interpretations (lease_until, created_at, id)
  WHERE status = 'processing';

CREATE TABLE reviews (
  id text PRIMARY KEY,
  interpretation_id text NOT NULL REFERENCES interpretations (id) ON DELETE RESTRICT,
  entry_id text NOT NULL REFERENCES entries (id) ON DELETE RESTRICT,
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

CREATE UNIQUE INDEX reviews_interpretation_reference
  ON reviews (interpretation_id, (resolution ->> 'reference'));
CREATE INDEX reviews_pending ON reviews (created_at, id) WHERE status = 'pending';
CREATE INDEX reviews_entry_pending
  ON reviews (entry_id, created_at, id) WHERE status = 'pending';

CREATE TABLE interpretation_review_completions (
  interpretation_id text PRIMARY KEY REFERENCES interpretations (id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL
);

CREATE TABLE states (
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

CREATE INDEX states_modality ON states (modality, recorded_at DESC, id DESC);

CREATE TABLE intents (
  id text PRIMARY KEY,
  capability_key text NOT NULL CHECK (btrim(capability_key) <> ''),
  capability_version integer NOT NULL CHECK (capability_version > 0),
  input jsonb NOT NULL,
  proposer jsonb NOT NULL CHECK (jsonb_typeof(proposer) = 'object'),
  conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'array'),
  expected_state jsonb NOT NULL CHECK (jsonb_typeof(expected_state) = 'array'),
  authorization_mode text NOT NULL CHECK (authorization_mode IN ('none', 'explicit')),
  trigger jsonb CHECK (trigger IS NULL OR jsonb_typeof(trigger) = 'object'),
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'authorized', 'cancelled', 'completed'))
);

CREATE INDEX intents_status ON intents (status, created_at, id);
CREATE INDEX intents_capability ON intents (capability_key, capability_version, created_at DESC);

CREATE TABLE attempts (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES intents (id) ON DELETE RESTRICT,
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

CREATE INDEX attempts_idempotency_key ON attempts (idempotency_key, started_at, id);

CREATE TABLE events (
  id text PRIMARY KEY,
  key text NOT NULL CHECK (btrim(key) <> ''),
  occurred_at timestamptz NOT NULL,
  intent_id text REFERENCES intents (id) ON DELETE RESTRICT,
  attempt_id text REFERENCES attempts (id) ON DELETE RESTRICT,
  entry_id text REFERENCES entries (id) ON DELETE RESTRICT,
  data jsonb NOT NULL,
  CHECK (intent_id IS NOT NULL OR attempt_id IS NOT NULL OR entry_id IS NOT NULL)
);

CREATE INDEX events_key ON events (key, occurred_at, id);
CREATE INDEX events_intent ON events (intent_id, occurred_at, id) WHERE intent_id IS NOT NULL;

CREATE TABLE rules (
  id text PRIMARY KEY,
  given_conditions jsonb NOT NULL CHECK (jsonb_typeof(given_conditions) = 'array'),
  trigger jsonb NOT NULL CHECK (jsonb_typeof(trigger) = 'object'),
  then_intents jsonb NOT NULL CHECK (
    jsonb_typeof(then_intents) = 'array' AND jsonb_array_length(then_intents) > 0
  ),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  evidence jsonb NOT NULL CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  created_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'stopped')),
  next_evaluation_at timestamptz,
  last_produced_at timestamptz,
  occurrences integer NOT NULL DEFAULT 0 CHECK (occurrences >= 0)
);

CREATE INDEX rules_due
  ON rules (next_evaluation_at, id)
  WHERE status = 'active' AND next_evaluation_at IS NOT NULL;
CREATE INDEX rules_event_trigger
  ON rules ((trigger ->> 'eventKey'), id)
  WHERE status = 'active' AND trigger -> 'operator' ->> 'key' = 'event';
CREATE INDEX rules_trigger ON rules USING gin (trigger jsonb_path_ops);

CREATE TABLE rule_deduplication_keys (
  rule_id text NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
  deduplication_id text NOT NULL CHECK (btrim(deduplication_id) <> ''),
  PRIMARY KEY (rule_id, deduplication_id)
);

CREATE TABLE rule_evaluation_results (
  id text PRIMARY KEY,
  rule_id text NOT NULL REFERENCES rules (id) ON DELETE RESTRICT,
  trigger_id text NOT NULL CHECK (btrim(trigger_id) <> ''),
  evaluated_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (
    outcome IN ('produced', 'givenFalse', 'stopped', 'expired', 'cooldown', 'duplicate')
  ),
  intent_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason text NOT NULL CHECK (btrim(reason) <> '')
);

CREATE INDEX rule_evaluation_results_rule
  ON rule_evaluation_results (rule_id, evaluated_at, id);

CREATE TABLE reminders (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES entries (id) ON DELETE RESTRICT,
  subject_item_id text NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  message text NOT NULL CHECK (btrim(message) <> ''),
  valid_from timestamptz,
  valid_to timestamptz,
  schedule jsonb NOT NULL CHECK (jsonb_typeof(schedule) = 'object'),
  rule_ids text[] NOT NULL CHECK (cardinality(rule_ids) > 0),
  status text NOT NULL CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL,
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to)
);

CREATE INDEX reminders_status ON reminders (status, created_at, id);
CREATE INDEX reminders_subject ON reminders (subject_item_id, created_at DESC);

CREATE TABLE workflow_outcomes (
  entry_id text NOT NULL REFERENCES entries (id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (btrim(reference) <> ''),
  kind text NOT NULL CHECK (kind IN ('planningRequest', 'reminderRequest')),
  status text NOT NULL CHECK (status IN ('applied', 'needsInput', 'unsupported', 'failed')),
  target_id text CHECK (target_id IS NULL OR btrim(target_id) <> ''),
  reason text CHECK (reason IS NULL OR btrim(reason) <> ''),
  details jsonb,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (entry_id, reference)
);

CREATE INDEX workflow_outcomes_recorded ON workflow_outcomes (recorded_at DESC, entry_id);

CREATE TABLE proactive_proposals (
  id text PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE CHECK (btrim(fingerprint) <> ''),
  detector_key text NOT NULL CHECK (btrim(detector_key) <> ''),
  detector_version integer NOT NULL CHECK (detector_version > 0),
  subject_item_id text REFERENCES items (id) ON DELETE RESTRICT,
  relevant_state text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  rationale text NOT NULL CHECK (btrim(rationale) <> ''),
  expected_effect text NOT NULL CHECK (btrim(expected_effect) <> ''),
  urgency text NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  expires_at timestamptz NOT NULL,
  capability_key text NOT NULL CHECK (btrim(capability_key) <> ''),
  capability_version integer NOT NULL CHECK (capability_version > 0),
  autonomy jsonb NOT NULL CHECK (jsonb_typeof(autonomy) = 'object'),
  intent_id text REFERENCES intents (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (
    status IN ('active', 'accepted', 'rejected', 'modified', 'postponed', 'expired', 'completed', 'unsupported')
  ),
  created_at timestamptz NOT NULL,
  feedback jsonb NOT NULL CHECK (jsonb_typeof(feedback) = 'array')
);

CREATE INDEX proactive_proposals_status
  ON proactive_proposals (status, expires_at, created_at, id);
