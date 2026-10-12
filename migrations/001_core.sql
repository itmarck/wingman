CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK (kind IN ('note','task','project')),
  title text NOT NULL, text text NOT NULL, "editedText" text,
  area text CHECK (area IN ('employment','freelance','venture','wellbeing','maintenance','social','entertainment')),
  "parentId" uuid REFERENCES entries(id) CHECK ("parentId" <> id),
  source text NOT NULL, "submissionKey" text, request jsonb,
  "occurredAt" timestamptz, "plannedFor" date, "dueAt" timestamptz, "finishedAt" timestamptz,
  context text CHECK (context IN ('home','computer','outside','phone')),
  effort smallint CHECK (effort BETWEEN 0 AND 3),
  importance smallint CHECK (importance BETWEEN 0 AND 3),
  "classifiedAt" timestamptz, attempts integer NOT NULL DEFAULT 0, "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "claimToken" uuid, "leaseUntil" timestamptz, error text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz,
  UNIQUE (source, "submissionKey"),
  CHECK ("finishedAt" IS NULL OR kind IN ('task','project')),
  CHECK (kind = 'task' OR ("plannedFor" IS NULL AND "dueAt" IS NULL AND context IS NULL AND effort IS NULL AND importance IS NULL)),
  CHECK (kind <> 'project' OR ("parentId" IS NULL AND area IS NOT NULL))
);
CREATE INDEX entries_pending ON entries ("nextAttemptAt") WHERE "classifiedAt" IS NULL;
CREATE INDEX entries_parent ON entries ("parentId");

CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT uuidv7(), name text NOT NULL,
  area text CHECK (area IN ('employment','freelance','venture','wellbeing','maintenance','social','entertainment')),
  definitions jsonb NOT NULL DEFAULT '{}', fields jsonb NOT NULL DEFAULT '[]',
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz,
  CHECK (id <> '00000000-0000-7000-8000-000000000001' OR "archivedAt" IS NULL)
);

CREATE TABLE records (
  id uuid PRIMARY KEY DEFAULT uuidv7(), "collectionId" uuid NOT NULL REFERENCES collections(id),
  title text NOT NULL, subtitle text, body text, category text, rating numeric, amount numeric, url text,
  "occurredAt" timestamptz, "dueAt" timestamptz, values jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz
);
CREATE INDEX records_collection ON records ("collectionId", "createdAt");
CREATE UNIQUE INDEX settings_key ON records (title)
  WHERE "collectionId" = '00000000-0000-7000-8000-000000000001' AND "archivedAt" IS NULL;

CREATE TABLE links (
  "fromId" uuid NOT NULL, "toId" uuid NOT NULL, "fieldId" uuid, note text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT ("fromId", "toId", "fieldId"), CHECK ("fromId" <> "toId")
);
CREATE INDEX links_to ON links ("toId");

CREATE TABLE preferences (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK (kind IN ('note','task','project')), text text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz
);

CREATE TABLE interactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), "entryId" uuid NOT NULL REFERENCES entries(id),
  type text NOT NULL CHECK (type IN ('postponed','skipped')), "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interactions_entry ON interactions ("entryId", "createdAt");

-- node-pg-migrate creates this schema first to keep its pgmigrations table here.
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE TABLE telemetry.classifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "entryId" uuid NOT NULL REFERENCES entries(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "durationMs" integer NOT NULL, model text,
  request jsonb, answers jsonb, error text
);
CREATE INDEX classifications_entry ON telemetry.classifications ("entryId", id);
CREATE TABLE telemetry.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "createdAt" timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL, "durationMs" integer, data jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX events_type ON telemetry.events (type, "createdAt");

-- The only Collection without area: the code requires one in every other write.
INSERT INTO collections (id, name, definitions) VALUES
  ('00000000-0000-7000-8000-000000000001', 'Settings', '{"title":"Key","body":"Value"}');
