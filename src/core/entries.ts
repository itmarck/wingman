import { Type } from 'typebox';
import { type Database, entity, type Transaction, transaction } from '../platform/storage.js';
import { readSettings } from './collections.js';
import { addDays, detectDates, instant, localDay } from './dates.js';
import {
  type Capture,
  type Context,
  captureSchema,
  contextSchema,
  dateSchema,
  type Entry,
  type EntryFilter,
  type EntryPatch,
  entryFilterSchema,
  entryPatchSchema,
  idSchema,
  type Kind,
  Problem,
  type ProjectInput,
  projectSchema,
  settingsCollectionId,
  titleOf,
  validate,
} from './model.js';
import { deriveNotices, rankTasks, type TaskFacts } from './tasks.js';

/** Which kinds may be the parent of which; v1: only projects, of any non-project Entry. */
export function canParent(parent: Kind, child: Kind): boolean {
  return parent === 'project' && child !== 'project';
}

/** Receive original text durably; classification happens later in the Processor. */
export async function capture(db: Database, source: string, input: Capture) {
  validate(captureSchema, input);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(source)) throw new Problem(400, 'Invalid source');
  return transaction(db, async (tx) => {
    const existing = await tx.query(
      'SELECT id, request=$3::jsonb AS same FROM entries WHERE source=$1 AND "submissionKey"=$2',
      [source, input.submissionKey, JSON.stringify(input)],
    );
    if (existing.rows[0]) {
      if (!existing.rows[0].same)
        throw new Problem(409, 'Submission key already used with different input');
      return { id: existing.rows[0].id as string, accepted: true as const };
    }
    const { timezone } = await readSettings(tx);
    const detected = detectDates(input.text, input.kind, new Date(), timezone);
    const occurredAt = input.occurredAt ? instant(input.occurredAt, timezone) : detected.occurredAt;
    const plannedFor =
      input.kind === 'task' ? (input.plannedFor ?? detected.plannedFor) : undefined;
    const dueAt = input.dueAt ? instant(input.dueAt, timezone) : detected.dueAt;
    const result = await tx.query(
      `INSERT INTO entries (kind, title, text, source, "submissionKey", request, "occurredAt", "plannedFor", "dueAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.kind,
        titleOf(input.text),
        input.text,
        source,
        input.submissionKey,
        JSON.stringify(input),
        occurredAt ?? null,
        plannedFor ?? null,
        input.kind === 'task' ? (dueAt ?? null) : null,
      ],
    );
    return { id: result.rows[0].id as string, accepted: true as const };
  });
}

/** Projects are created only from the panel, with their area chosen there; they are not classified. */
export async function createProject(db: Database, source: string, input: ProjectInput) {
  validate(projectSchema, input);
  return (
    await db.query(
      `INSERT INTO entries (kind, title, text, area, source, "classifiedAt")
      VALUES ('project', $1, $2, $3, $4, now()) RETURNING *`,
      [input.title.trim(), input.text ?? input.title.trim(), input.area, source],
    )
  ).rows[0] as Entry;
}

/** One Entry with its parent, children count and latest classification. */
export async function getEntry(db: Database, id: string) {
  validate(idSchema, id);
  const entry = (
    await db.query(
      `SELECT e.*, p.title AS "parentTitle",
        (SELECT count(*) FROM entries c WHERE c."parentId"=e.id AND c."archivedAt" IS NULL) AS children,
        (SELECT row_to_json(x) FROM (SELECT id, "createdAt", model, answers, error FROM telemetry.classifications
          WHERE "entryId"=e.id ORDER BY id DESC LIMIT 1) x) AS classification
      FROM entries e LEFT JOIN entries p ON p.id=e."parentId" WHERE e.id=$1`,
      [id],
    )
  ).rows[0];
  if (!entry) throw new Problem(404, 'Entry not found');
  return entry;
}

/** List Entries by filters, newest first. */
export async function listEntries(db: Database, filter: EntryFilter = {}) {
  validate(entryFilterSchema, filter);
  return (
    await db.query(
      `SELECT * FROM entries WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR area=$2)
      AND ($3::uuid IS NULL OR "parentId"=$3) AND ($4::boolean IS NULL OR ("finishedAt" IS NULL)=$4)
      AND ("archivedAt" IS NOT NULL)=$5 ORDER BY "createdAt" DESC, id DESC LIMIT $6 OFFSET $7`,
      [
        filter.kind ?? null,
        filter.area ?? null,
        filter.parentId ?? null,
        filter.open ?? null,
        filter.archived ?? false,
        filter.limit ?? 50,
        filter.offset ?? 0,
      ],
    )
  ).rows as Entry[];
}

const patchColumns = [
  'title',
  'editedText',
  'area',
  'parentId',
  'occurredAt',
  'plannedFor',
  'dueAt',
  'context',
  'effort',
  'importance',
] as const;

/** Edit or correct an Entry; the original text never changes, and corrections win over JEV. */
export async function updateEntry(db: Database, id: string, patch: EntryPatch) {
  validate(idSchema, id);
  validate(entryPatchSchema, patch);
  return transaction(db, async (tx) => {
    const entry = (await tx.query('SELECT * FROM entries WHERE id=$1 FOR UPDATE', [id])).rows[0] as
      | Entry
      | undefined;
    if (!entry) throw new Problem(404, 'Entry not found');
    if (patch.parentId) await parentValid(tx, entry, patch.parentId);
    const { timezone } = await readSettings(tx);
    const values: Record<string, unknown> = { ...patch };
    for (const column of ['occurredAt', 'dueAt'] as const) {
      const value = patch[column];
      if (value) values[column] = instant(value, timezone);
    }
    const changed = patchColumns.filter((column) => values[column] !== undefined);
    return (
      await tx.query(
        `UPDATE entries SET ${changed.map((column, i) => `"${column}"=$${i + 2}`).join(', ')},
        "updatedAt"=clock_timestamp() WHERE id=$1 RETURNING *`,
        [id, ...changed.map((column) => values[column])],
      )
    ).rows[0] as Entry;
  });
}

async function parentValid(tx: Transaction, entry: Entry, parentId: string) {
  const parent = (await tx.query('SELECT * FROM entries WHERE id=$1', [parentId])).rows[0] as
    | Entry
    | undefined;
  if (!parent || parent.archivedAt) throw new Problem(400, 'Parent not found');
  if (!canParent(parent.kind, entry.kind)) throw new Problem(400, 'Invalid parent kind');
  const ancestors = await tx.query(
    `WITH RECURSIVE up(id, "parentId") AS (SELECT id, "parentId" FROM entries WHERE id=$1
      UNION SELECT e.id, e."parentId" FROM entries e JOIN up ON e.id=up."parentId")
    SELECT 1 FROM up WHERE id=$2`,
    [parentId, entry.id],
  );
  if (ancestors.rowCount) throw new Problem(400, 'Parent would create a cycle');
}

/** Finish or reopen a task or project; the state is the finishedAt fact. */
export async function setFinished(db: Database, id: string, finished: boolean, kinds: Kind[]) {
  validate(idSchema, id);
  const result = await db.query(
    `UPDATE entries SET "finishedAt"=CASE WHEN $2 THEN coalesce("finishedAt", now()) ELSE NULL END,
    "updatedAt"=clock_timestamp() WHERE id=$1 AND kind=ANY($3) RETURNING *`,
    [id, finished, kinds],
  );
  if (!result.rows[0]) throw new Problem(404, 'Entry not found');
  return result.rows[0] as Entry;
}

/** Record a postponement (moving plannedFor) or a skip as facts that lower the task score. */
export async function interact(
  db: Database,
  id: string,
  type: 'postponed' | 'skipped',
  until?: string,
) {
  validate(idSchema, id);
  if (until !== undefined) validate(dateSchema, until);
  return transaction(db, async (tx) => {
    const task = (
      await tx.query(
        `SELECT id FROM entries WHERE id=$1 AND kind='task' AND "finishedAt" IS NULL AND "archivedAt" IS NULL FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!task) throw new Problem(404, 'Open task not found');
    await tx.query('INSERT INTO interactions ("entryId", type) VALUES ($1,$2)', [id, type]);
    if (type === 'postponed') {
      const { timezone } = await readSettings(tx);
      await tx.query(
        'UPDATE entries SET "plannedFor"=$2, "updatedAt"=clock_timestamp() WHERE id=$1',
        [id, until ?? addDays(localDay(new Date(), timezone), 1)],
      );
    }
    return { id, type };
  });
}

/** Archive or restore any item; nothing is physically deleted. */
export async function archive(db: Database, id: string, archived: boolean) {
  validate(idSchema, id);
  validate(Type.Boolean(), archived);
  if (id === settingsCollectionId) throw new Problem(400, 'Settings cannot be archived');
  const found = await entity(db, id);
  const table = { entry: 'entries', collection: 'collections', record: 'records' }[found.type];
  await db.query(
    `UPDATE ${table} SET "archivedAt"=CASE WHEN $2 THEN coalesce("archivedAt", now()) ELSE NULL END,
    "updatedAt"=clock_timestamp() WHERE id=$1`,
    [id, archived],
  );
  return { id, archived };
}

/** The journal: notes by when they happened, finished tasks and dated Records, grouped by day. */
export async function journal(db: Database, from: string, to: string) {
  validate(dateSchema, from);
  validate(dateSchema, to);
  if (to < from || Date.parse(to) - Date.parse(from) > 92 * 86400000)
    throw new Problem(400, 'Invalid date range');
  const { timezone } = await readSettings(db);
  const rows = (
    await db.query(
      `WITH items AS (
        SELECT id, 'entry' AS type, kind, NULL AS collection, title, area, coalesce("occurredAt", "createdAt") AS at
          FROM entries WHERE kind='note' AND "archivedAt" IS NULL
        UNION ALL SELECT id, 'entry', kind, NULL, title, area, "finishedAt"
          FROM entries WHERE kind='task' AND "finishedAt" IS NOT NULL AND "archivedAt" IS NULL
        UNION ALL SELECT r.id, 'record', NULL, c.name, r.title, c.area, r."occurredAt"
          FROM records r JOIN collections c ON c.id=r."collectionId"
          WHERE r."occurredAt" IS NOT NULL AND r."archivedAt" IS NULL AND c.id<>$4)
      SELECT *, to_char(at AT TIME ZONE $3, 'YYYY-MM-DD') AS day FROM items
      WHERE (at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date ORDER BY at`,
      [from, to, timezone, settingsCollectionId],
    )
  ).rows as { day: string }[];
  const days = new Map<string, unknown[]>();
  for (const { day, ...item } of rows) days.set(day, [...(days.get(day) ?? []), item]);
  return [...days].map(([day, items]) => ({ day, items }));
}

/** The short prioritized task list; deterministic, never calls JEV. */
export async function nowTasks(
  db: Database,
  options: { context?: Context; minutes?: number; limit?: number } = {},
) {
  if (options.context !== undefined) validate(contextSchema, options.context);
  const settings = await readSettings(db);
  const { timezone } = settings;
  const now = new Date();
  const today = localDay(now, timezone);
  const tasks = (
    await db.query(
      `SELECT e.id, e.title, e.area, e."parentId", e."plannedFor", e."dueAt", e."createdAt",
        e.context, e.effort, e.importance,
        (SELECT count(*) FROM interactions i WHERE i."entryId"=e.id AND i.type='postponed') AS postponed,
        EXISTS (SELECT 1 FROM interactions i WHERE i."entryId"=e.id AND i.type='skipped' AND i."createdAt">=$1) AS "skippedToday"
      FROM entries e WHERE kind='task' AND "finishedAt" IS NULL AND "archivedAt" IS NULL`,
      [instant(today, timezone)],
    )
  ).rows as TaskFacts[];
  return rankTasks(tasks, { now, today, context: options.context, minutes: options.minutes }).slice(
    0,
    options.limit ?? settings.nowLimit,
  );
}

/** Current passive notices, derived from facts on every read. */
export async function notifications(db: Database) {
  const rows = (
    await db.query(
      `SELECT id, kind, title, "dueAt", "finishedAt", attempts, error, "createdAt" FROM entries
      WHERE "archivedAt" IS NULL AND (("classifiedAt" IS NULL AND error IS NOT NULL AND attempts >= 3)
        OR (kind='task' AND "finishedAt" IS NULL AND "dueAt" < now() + interval '1 day'))`,
    )
  ).rows;
  return deriveNotices(rows, new Date());
}
