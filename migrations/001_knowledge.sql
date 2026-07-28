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

CREATE TABLE concepts (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  normalized_name text NOT NULL CHECK (btrim(normalized_name) <> ''),
  definition text NOT NULL CHECK (btrim(definition) <> ''),
  normalized_definition text NOT NULL CHECK (btrim(normalized_definition) <> ''),
  UNIQUE (normalized_name, normalized_definition)
);

CREATE INDEX concepts_normalized_name ON concepts (normalized_name);

CREATE TABLE aliases (
  concept_id text NOT NULL REFERENCES concepts (id) ON DELETE RESTRICT,
  value text NOT NULL CHECK (btrim(value) <> ''),
  normalized_value text NOT NULL CHECK (btrim(normalized_value) <> ''),
  PRIMARY KEY (concept_id, normalized_value)
);

CREATE INDEX aliases_normalized_value ON aliases (normalized_value);

CREATE TABLE predicates (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE CHECK (
    key ~ '^[a-z][A-Za-z0-9]*$' OR
    key ~ '^system\.[a-z][A-Za-z0-9]*$'
  ),
  definition text NOT NULL CHECK (btrim(definition) <> ''),
  origin text NOT NULL CHECK (origin IN ('custom', 'system')),
  scope text NOT NULL CHECK (scope IN ('axiom', 'both', 'link')),
  mode text NOT NULL CHECK (mode IN ('descriptive', 'operational')),
  CHECK ((key LIKE 'system.%') = (origin = 'system')),
  CHECK (mode <> 'operational' OR key = 'system.supersedes'),
  CHECK (
    key <> 'system.supersedes' OR
    (origin = 'system' AND scope = 'link' AND mode = 'operational')
  )
);

INSERT INTO predicates (id, key, definition, origin, scope, mode)
VALUES (
  'system.supersedes',
  'system.supersedes',
  'The source Axiom replaces the target Axiom as current knowledge',
  'system',
  'link',
  'operational'
);

CREATE TABLE axioms (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES entries (id) ON DELETE RESTRICT,
  subject_concept_id text NOT NULL REFERENCES concepts (id) ON DELETE RESTRICT,
  predicate_id text NOT NULL REFERENCES predicates (id) ON DELETE RESTRICT,
  object_kind text NOT NULL CHECK (object_kind IN ('concept', 'literal')),
  object_concept_id text REFERENCES concepts (id) ON DELETE RESTRICT,
  literal_kind text CHECK (
    literal_kind IS NULL OR
    literal_kind IN ('boolean', 'date', 'dateTime', 'number', 'text', 'url')
  ),
  literal_value jsonb,
  source_locators jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_locators) = 'array'),
  CHECK (
    (
      object_kind = 'concept' AND
      object_concept_id IS NOT NULL AND
      literal_kind IS NULL AND
      literal_value IS NULL
    ) OR
    (
      object_kind = 'literal' AND
      object_concept_id IS NULL AND
      literal_kind IS NOT NULL AND
      literal_value IS NOT NULL
    )
  ),
  CHECK (
    object_kind <> 'literal' OR
    (literal_kind = 'boolean' AND jsonb_typeof(literal_value) = 'boolean') OR
    (literal_kind = 'number' AND jsonb_typeof(literal_value) = 'number') OR
    (
      literal_kind IN ('date', 'dateTime', 'text', 'url') AND
      jsonb_typeof(literal_value) = 'string'
    )
  )
);

CREATE INDEX axioms_entry_id ON axioms (entry_id);
CREATE INDEX axioms_subject_concept_id ON axioms (subject_concept_id);
CREATE INDEX axioms_object_concept_id ON axioms (object_concept_id)
  WHERE object_concept_id IS NOT NULL;
CREATE INDEX axioms_predicate_id ON axioms (predicate_id);

CREATE UNIQUE INDEX axioms_exact_duplicate
  ON axioms (
    entry_id,
    subject_concept_id,
    predicate_id,
    object_kind,
    COALESCE(object_concept_id, ''),
    COALESCE(literal_kind, ''),
    COALESCE(literal_value, 'null'::jsonb),
    source_locators
  );

CREATE TABLE links (
  id text PRIMARY KEY,
  source_axiom_id text NOT NULL REFERENCES axioms (id) ON DELETE RESTRICT,
  predicate_id text NOT NULL REFERENCES predicates (id) ON DELETE RESTRICT,
  target_axiom_id text NOT NULL REFERENCES axioms (id) ON DELETE RESTRICT,
  provenance_kind text NOT NULL CHECK (provenance_kind IN ('entry', 'inference')),
  provenance_entry_id text REFERENCES entries (id) ON DELETE RESTRICT,
  evidence_axiom_ids text[],
  source_locators jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_locators) = 'array'),
  CHECK (source_axiom_id <> target_axiom_id),
  CHECK (
    (
      provenance_kind = 'entry' AND
      provenance_entry_id IS NOT NULL AND
      evidence_axiom_ids IS NULL
    ) OR
    (
      provenance_kind = 'inference' AND
      provenance_entry_id IS NULL AND
      evidence_axiom_ids IS NOT NULL AND
      cardinality(evidence_axiom_ids) > 0 AND
      source_locators = '[]'::jsonb
    )
  )
);

CREATE INDEX links_source_axiom_id ON links (source_axiom_id);
CREATE INDEX links_target_axiom_id ON links (target_axiom_id);
CREATE INDEX links_predicate_id ON links (predicate_id);

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
  CHECK (
    (status = 'queued' AND available_at IS NOT NULL) OR
    (status <> 'queued' AND available_at IS NULL)
  ),
  CHECK (status = 'queued' OR attempts > 0),
  CHECK (
    status <> 'pending' OR
    (draft IS NOT NULL AND interpreter_key IS NOT NULL)
  ),
  CHECK (
    status <> 'completed' OR
    (publication IS NOT NULL AND interpreter_key IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('failed', 'exhausted') OR
    (error IS NOT NULL AND btrim(error) <> '')
  ),
  CHECK (status = 'completed' OR publication IS NULL),
  CHECK (
    status IN ('queued', 'failed', 'exhausted') OR
    error IS NULL
  ),
  CHECK (
    (claim_id IS NULL AND lease_until IS NULL) OR
    (claim_id IS NOT NULL AND lease_until IS NOT NULL)
  )
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
  kind text NOT NULL CHECK (kind = 'ambiguousConcept'),
  status text NOT NULL CHECK (status IN ('pending', 'resolved')),
  ambiguity jsonb NOT NULL CHECK (
    jsonb_typeof(ambiguity) = 'object' AND
    btrim(ambiguity ->> 'reference') <> ''
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
  ON reviews (interpretation_id, (ambiguity ->> 'reference'));

CREATE INDEX reviews_pending
  ON reviews (created_at, id)
  WHERE status = 'pending';
