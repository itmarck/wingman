CREATE TABLE content (
  id uuid PRIMARY KEY, title text NOT NULL, text text NOT NULL, "editedText" text,
  "inputMode" text NOT NULL CHECK ("inputMode" IN ('Entry','Note')),
  source text NOT NULL, "submissionKey" text NOT NULL, request jsonb NOT NULL,
  preset text NOT NULL CHECK (preset IN ('organize','taskCapture')), "plannedFor" date, "dueAt" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "archivedAt" timestamptz, "classifiedAt" timestamptz, classification jsonb,
  attempts integer NOT NULL DEFAULT 0, "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "claimToken" uuid, "leaseUntil" timestamptz, error text, UNIQUE(source, "submissionKey")
);
CREATE INDEX content_pending ON content ("nextAttemptAt") WHERE "classifiedAt" IS NULL;
CREATE TABLE collections (
  id uuid PRIMARY KEY, name text NOT NULL,
  area text NOT NULL CHECK (area IN ('employment','freelance','venture','wellbeing','maintenance','social','entertainment')),
  definitions jsonb NOT NULL DEFAULT '{}', fields jsonb NOT NULL DEFAULT '[]',
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz
);
CREATE TABLE records (
  id uuid PRIMARY KEY, "collectionId" uuid NOT NULL REFERENCES collections(id), title text NOT NULL,
  subtitle text, body text, category text, percentage numeric CHECK (percentage BETWEEN 0 AND 100),
  "occurredAt" text, "dueAt" text, url text, values jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz
);
CREATE INDEX records_collection ON records ("collectionId", "createdAt", id);
CREATE TABLE tasks (
  id uuid PRIMARY KEY, title text NOT NULL,
  area text NOT NULL CHECK (area IN ('employment','freelance','venture','wellbeing','maintenance','social','entertainment')),
  "plannedFor" date, "dueAt" text, "finishedAt" timestamptz, "sourceId" uuid UNIQUE REFERENCES content(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "archivedAt" timestamptz
);
CREATE INDEX tasks_day ON tasks ("plannedFor", id) WHERE "archivedAt" IS NULL;
CREATE TABLE links (
  "fromId" uuid NOT NULL, "toId" uuid NOT NULL, "fieldId" uuid, context text,
  UNIQUE NULLS NOT DISTINCT ("fromId", "toId", "fieldId"), CHECK ("fromId" <> "toId")
);
CREATE INDEX links_destination ON links ("toId");
CREATE TABLE notifications (
  "subjectId" uuid PRIMARY KEY, message text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
  "acknowledgedAt" timestamptz, "deferredUntil" timestamptz, "resolvedAt" timestamptz
);
CREATE TABLE settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), timezone text NOT NULL, "taskCapture" boolean NOT NULL);
INSERT INTO settings VALUES (true, 'America/Lima', false);
CREATE TABLE telemetry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "contentId" uuid NOT NULL REFERENCES content(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "durationMs" integer NOT NULL, model text, result jsonb, error text
);
