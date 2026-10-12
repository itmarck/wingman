import { randomUUID } from 'node:crypto';
import type { Classify } from '../platform/decisions.js';
import { type Database, transaction } from '../platform/storage.js';
import {
  type Entry,
  idSchema,
  type PreferenceInput,
  Problem,
  preferenceSchema,
  validate,
} from './model.js';
import { type AppliedAnswer, buildQuestions, interpret, questionsOf } from './questions.js';

/** Claim one pending Entry, ask JEV outside SQL, and publish attributes and reasons together. */
export async function run(
  db: Database,
  classify: Classify,
  signal?: AbortSignal,
): Promise<boolean> {
  const token = randomUUID();
  const entry = (
    await db.query<Entry>(
      `UPDATE entries SET "claimToken"=$1, "leaseUntil"=now()+interval '2 minutes', attempts=attempts+1
      WHERE id=(SELECT id FROM entries WHERE "classifiedAt" IS NULL AND "archivedAt" IS NULL AND "nextAttemptAt"<=now()
        AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`,
      [token],
    )
  ).rows[0];
  if (!entry) return false;
  const started = Date.now();
  const projects = (
    await db.query(
      `SELECT id, title, coalesce("editedText", text) AS text FROM entries
      WHERE kind='project' AND "finishedAt" IS NULL AND "archivedAt" IS NULL ORDER BY "createdAt"`,
    )
  ).rows;
  const preferences = (
    await db.query(
      'SELECT text FROM preferences WHERE kind=$1 AND "archivedAt" IS NULL ORDER BY "createdAt"',
      [entry.kind],
    )
  ).rows.map((row) => row.text as string);
  const definitions = buildQuestions(entry.kind, projects);
  const state = { kind: entry.kind, text: entry.editedText ?? entry.text, preferences };
  const questions = questionsOf(definitions);
  const request = { state, questions };
  let model: string;
  let applied: Record<string, AppliedAnswer>;
  let attributes: Record<string, unknown>;
  try {
    const result = await classify(state, questions, signal);
    model = result.model;
    ({ applied, attributes } = interpret(definitions, result.answers));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Classification failed';
    await transaction(db, async (tx) => {
      const updated = await tx.query(
        `UPDATE entries SET error=$3, "claimToken"=NULL, "leaseUntil"=NULL,
        "nextAttemptAt"=now()+make_interval(secs => LEAST(3600, power(2, LEAST(attempts, 10))::integer))
        WHERE id=$1 AND "claimToken"=$2 RETURNING id`,
        [entry.id, token, message],
      );
      if (updated.rowCount)
        await tx.query(
          'INSERT INTO telemetry.classifications ("entryId", "durationMs", request, error) VALUES ($1,$2,$3,$4)',
          [entry.id, Date.now() - started, JSON.stringify(request), message],
        );
    });
    return true;
  }
  await transaction(db, async (tx) => {
    const current = await tx.query(
      'SELECT id FROM entries WHERE id=$1 AND "claimToken"=$2 AND "classifiedAt" IS NULL FOR UPDATE',
      [entry.id, token],
    );
    if (!current.rowCount) return;
    const parentId = attributes.parentId;
    const parentOpen =
      parentId &&
      (
        await tx.query(
          `SELECT 1 FROM entries WHERE id=$1 AND kind='project' AND "finishedAt" IS NULL AND "archivedAt" IS NULL`,
          [parentId],
        )
      ).rowCount;
    await tx.query(
      `UPDATE entries SET area=coalesce(area, $3), "parentId"=coalesce("parentId", $4),
        context=coalesce(context, $5), effort=coalesce(effort, $6), importance=coalesce(importance, $7),
        "classifiedAt"=now(), "claimToken"=NULL, "leaseUntil"=NULL, error=NULL
      WHERE id=$1 AND "claimToken"=$2`,
      [
        entry.id,
        token,
        attributes.area ?? null,
        parentOpen ? parentId : null,
        attributes.context ?? null,
        attributes.effort ?? null,
        attributes.importance ?? null,
      ],
    );
    await tx.query(
      'INSERT INTO telemetry.classifications ("entryId", "durationMs", model, request, answers) VALUES ($1,$2,$3,$4,$5)',
      [entry.id, Date.now() - started, model, JSON.stringify(request), JSON.stringify(applied)],
    );
  });
  return true;
}

/** Retry a failed classification now, without waiting for its backoff. */
export async function retry(db: Database, id: string): Promise<{ id: string }> {
  validate(idSchema, id);
  const result = await db.query(
    `UPDATE entries SET "nextAttemptAt"=now() WHERE id=$1 AND "classifiedAt" IS NULL AND "claimToken" IS NULL RETURNING id`,
    [id],
  );
  if (!result.rowCount) throw new Problem(409, 'Nothing to retry');
  return { id };
}

/** The processing flow for the panel: latest Entries with their state and classification attempts. */
export async function flow(db: Database, limit = 50) {
  return (
    await db.query(
      `SELECT e.id, e.kind, e.title, e.area, e."parentId", e.context, e.effort, e.importance,
        e."plannedFor", e."dueAt", e."occurredAt", e."finishedAt", e.source, e."createdAt",
        e."classifiedAt", e.attempts, e.error, e."nextAttemptAt",
        CASE WHEN e."classifiedAt" IS NOT NULL THEN 'classified' WHEN e."leaseUntil" > now() THEN 'processing'
          WHEN e.error IS NOT NULL THEN 'failed' ELSE 'pending' END AS status,
        coalesce((SELECT jsonb_agg(row_to_json(c) ORDER BY c.id DESC) FROM
          (SELECT id, "createdAt", "durationMs", model, request, answers, error FROM telemetry.classifications WHERE "entryId"=e.id) c), '[]') AS classifications
      FROM entries e WHERE e.kind <> 'project' ORDER BY e."createdAt" DESC, e.id DESC LIMIT $1`,
      [limit],
    )
  ).rows;
}

/** Run one Processor alongside HTTP, with interruptible shutdown. */
export function startProcessor(
  db: Database,
  classify: Classify,
  onError: (error: unknown) => void,
) {
  const abort = new AbortController();
  let wake: (() => void) | undefined;
  const done = (async () => {
    while (!abort.signal.aborted) {
      try {
        if (await run(db, classify, abort.signal)) continue;
      } catch (error) {
        onError(error);
      }
      if (abort.signal.aborted) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  })();
  return async () => {
    abort.abort();
    wake?.();
    await done;
  };
}

/** Natural-language classification preferences, edited only from the panel. */
export async function listPreferences(db: Database) {
  return (
    await db.query(
      'SELECT * FROM preferences WHERE "archivedAt" IS NULL ORDER BY kind, "createdAt"',
    )
  ).rows;
}
export async function createPreference(db: Database, input: PreferenceInput) {
  validate(preferenceSchema, input);
  return (
    await db.query('INSERT INTO preferences (kind, text) VALUES ($1,$2) RETURNING *', [
      input.kind,
      input.text.trim(),
    ])
  ).rows[0];
}
export async function updatePreference(db: Database, id: string, input: PreferenceInput) {
  validate(idSchema, id);
  validate(preferenceSchema, input);
  const row = (
    await db.query(
      'UPDATE preferences SET kind=$2, text=$3, "updatedAt"=clock_timestamp() WHERE id=$1 RETURNING *',
      [id, input.kind, input.text.trim()],
    )
  ).rows[0];
  if (!row) throw new Problem(404, 'Preference not found');
  return row;
}
export async function archivePreference(db: Database, id: string) {
  validate(idSchema, id);
  const result = await db.query(
    'UPDATE preferences SET "archivedAt"=now() WHERE id=$1 AND "archivedAt" IS NULL',
    [id],
  );
  if (!result.rowCount) throw new Problem(404, 'Preference not found');
  return { id, archived: true };
}
