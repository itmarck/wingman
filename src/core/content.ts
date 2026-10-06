import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { Collection, Content, StoredRecord } from './model.js';
import {
  type Capture,
  type CollectionInput,
  captureSchema,
  collectionSchema,
  type Field,
  fieldsValid,
  idSchema,
  type LinkInput,
  linkSchema,
  Problem,
  type RecordInput,
  recordSchema,
  temporal,
  textSchema,
  validate,
  valuesValid,
} from './model.js';
import {
  type Database,
  entitiesSql,
  entity,
  lockForms,
  type Transaction,
  transaction,
} from '../platform/storage.js';

/** Receive original text durably; receipt never waits for inference. */
export async function capture(db: Database, source: string, input: Capture) {
  validate(captureSchema, input);
  input = structuredClone(input);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(source)) throw new Problem(400, 'Invalid source');
  temporal(input.plannedFor);
  temporal(input.dueAt);
  const request = { ...input, preset: input.preset ?? 'organize' };
  if (input.inputMode === 'Note' && request.preset === 'taskCapture')
    throw new Problem(400, 'Notes cannot extract Tasks');
  if (request.preset === 'taskCapture' && !input.plannedFor)
    throw new Problem(400, 'taskCapture requires an explicit plannedFor date');
  return transaction(db, async (tx) => {
    const existing = await tx.query(
      'SELECT id, request=$3::jsonb AS same FROM content WHERE source=$1 AND "submissionKey"=$2',
      [source, input.submissionKey, JSON.stringify(request)],
    );
    if (existing.rows[0]) {
      if (!existing.rows[0].same)
        throw new Problem(409, 'Submission key already used with different input');
      return { id: existing.rows[0].id as string, accepted: true as const };
    }
    const settings = await tx.query('SELECT "taskCapture" FROM settings WHERE id=true');
    if (request.preset === 'taskCapture' && !settings.rows[0].taskCapture)
      throw new Problem(400, 'taskCapture is disabled');
    const result = await tx.query(
      `INSERT INTO content (id,title,text,"inputMode",source,"submissionKey",request,preset,"plannedFor","dueAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (source,"submissionKey") DO NOTHING RETURNING id`,
      [
        randomUUID(),
        input.text.trim().split(/\r?\n/)[0],
        input.text,
        input.inputMode,
        source,
        input.submissionKey,
        JSON.stringify(request),
        request.preset,
        input.plannedFor ?? null,
        input.dueAt ?? null,
      ],
    );
    if (result.rows[0]) return { id: result.rows[0].id as string, accepted: true as const };
    const concurrent = await tx.query(
      'SELECT id, request=$3::jsonb AS same FROM content WHERE source=$1 AND "submissionKey"=$2',
      [source, input.submissionKey, JSON.stringify(request)],
    );
    if (!concurrent.rows[0]?.same)
      throw new Problem(409, 'Submission key already used with different input');
    return { id: concurrent.rows[0].id as string, accepted: true as const };
  });
}

/** Save a definition only if every existing value and reference remains valid. */
export async function saveCollection(db: Database, input: CollectionInput): Promise<Collection> {
  validate(collectionSchema, input);
  input = structuredClone(input);
  fieldsValid(input.fields);
  const properties = [
    'title',
    'subtitle',
    'body',
    'category',
    'percentage',
    'occurredAt',
    'dueAt',
    'url',
  ];
  if (Object.keys(input.definitions ?? {}).some((key) => !properties.includes(key)))
    throw new Problem(400, 'Unknown shared property');
  return transaction(db, async (tx) => {
    await lockForms(tx);
    const id = input.id ?? randomUUID();
    const previous = input.id
      ? (await tx.query('SELECT * FROM collections WHERE id=$1 FOR UPDATE', [id])).rows[0]
      : undefined;
    if (input.id && !previous) throw new Problem(404, 'Collection not found');
    if (previous) {
      for (const field of previous.fields as Field[]) {
        if (!input.fields.some((next) => next.id === field.id))
          throw new Problem(409, 'Use removeField to delete fields explicitly');
      }
      const records = await tx.query('SELECT id,values FROM records WHERE "collectionId"=$1', [id]);
      for (const record of records.rows) {
        valuesValid(input.fields, record.values);
        const links = await tx.query(
          'SELECT * FROM links WHERE "fromId"=$1 AND "fieldId" IS NOT NULL',
          [record.id],
        );
        for (const link of links.rows) await validReference(tx, input.fields, link, links.rows);
      }
    }
    for (const field of input.fields) {
      if (field.collectionId && field.collectionId !== id) {
        const target = await entity(tx, field.collectionId);
        if (target.type !== 'Collection')
          throw new Problem(400, 'Reference target must be a Collection');
      }
    }
    return (
      await tx.query(
        `INSERT INTO collections (id,name,area,definitions,fields) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET name=excluded.name,area=excluded.area,definitions=excluded.definitions,fields=excluded.fields,"updatedAt"=clock_timestamp() RETURNING *`,
        [
          id,
          input.name.trim(),
          input.area,
          JSON.stringify(input.definitions ?? previous?.definitions ?? {}),
          JSON.stringify(input.fields),
        ],
      )
    ).rows[0];
  });
}

/** A form save changes explicit properties only; references never live in values. */
export async function saveRecord(db: Database, input: RecordInput): Promise<StoredRecord> {
  validate(recordSchema, input);
  input = structuredClone(input);
  temporal(input.occurredAt);
  temporal(input.dueAt);
  if (input.url) {
    try {
      if (!['https:', 'http:'].includes(new URL(input.url).protocol)) throw new Error();
    } catch {
      throw new Problem(400, 'URL must be HTTP or HTTPS');
    }
  }
  return transaction(db, async (tx) => {
    await lockForms(tx);
    const collection = (
      await tx.query('SELECT fields FROM collections WHERE id=$1 AND "archivedAt" IS NULL', [
        input.collectionId,
      ])
    ).rows[0];
    if (!collection) throw new Problem(404, 'Collection not found');
    const previous = input.id
      ? (await tx.query('SELECT * FROM records WHERE id=$1 FOR UPDATE', [input.id])).rows[0]
      : undefined;
    if (input.id && !previous) throw new Problem(404, 'Record not found');
    if (previous && previous.collectionId !== input.collectionId)
      throw new Problem(409, 'Record cannot change Collection');
    const values = { ...previous?.values, ...input.values };
    valuesValid(collection.fields, values);
    const row = { ...previous, ...input, id: input.id ?? randomUUID(), values };
    const columns = [
      'id',
      'collectionId',
      'title',
      'subtitle',
      'body',
      'category',
      'percentage',
      'occurredAt',
      'dueAt',
      'url',
      'values',
    ];
    const result = await tx.query(
      `INSERT INTO records (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})
      ON CONFLICT (id) DO UPDATE SET ${columns
        .slice(2)
        .map((c) => `"${c}"=excluded."${c}"`)
        .join(',')},"updatedAt"=clock_timestamp() RETURNING *`,
      columns.map((c) => (c === 'values' ? JSON.stringify(values) : (row[c] ?? null))),
    );
    for (const [fieldId, ids] of Object.entries(input.references ?? {})) {
      const field = (collection.fields as Field[]).find((f) => f.id === fieldId);
      if (field?.type !== 'reference') throw new Problem(400, 'Unknown reference field');
      if (!field.multiple && ids.length > 1) throw new Problem(400, 'Reference accepts one value');
      await tx.query('DELETE FROM links WHERE "fromId"=$1 AND "fieldId"=$2', [row.id, fieldId]);
      for (const toId of ids) await insertLink(tx, { fromId: row.id, toId, fieldId });
    }
    return result.rows[0];
  });
}

/** Read a Collection and its visible Records for the launcher form. */
export async function collections(db: Database, id?: string, offset = 0) {
  if (id) validate(idSchema, id);
  if (id) {
    const definition = (
      await db.query('SELECT * FROM collections WHERE id=$1 AND "archivedAt" IS NULL', [id])
    ).rows[0];
    if (!definition) throw new Problem(404, 'Collection not found');
    const records = await db.query(
      'SELECT r.*,c.area FROM records r JOIN collections c ON c.id=r."collectionId" WHERE c.id=$1 AND r."archivedAt" IS NULL ORDER BY r."createdAt",r.id LIMIT 100 OFFSET $2',
      [id, offset],
    );
    const references = await db.query(
      'SELECT l.* FROM links l JOIN records r ON r.id=l."fromId" WHERE r.id=ANY($1::uuid[]) AND l."fieldId" IS NOT NULL',
      [records.rows.map((r) => r.id)],
    );
    return { ...definition, records: records.rows, references: references.rows };
  }
  return (
    await db.query(
      'SELECT * FROM collections WHERE "archivedAt" IS NULL ORDER BY name,id LIMIT 100 OFFSET $1',
      [offset],
    )
  ).rows;
}

async function validReference(
  tx: Transaction,
  fields: Field[],
  input: LinkInput,
  siblings: LinkInput[],
) {
  const field = fields.find((field) => field.id === input.fieldId);
  if (field?.type !== 'reference') throw new Problem(409, 'Invalid reference field');
  if (
    !field.multiple &&
    siblings.filter((link) => link.fieldId === input.fieldId && link.toId !== input.toId).length
  )
    throw new Problem(409, 'Reference accepts one value');
  if (field.collectionId) {
    const target = (await tx.query('SELECT "collectionId" FROM records WHERE id=$1', [input.toId]))
      .rows[0];
    if (target?.collectionId !== field.collectionId)
      throw new Problem(409, 'Reference belongs to another Collection');
  }
}

async function insertLink(tx: Transaction, input: LinkInput) {
  if (input.fromId === input.toId) throw new Problem(400, 'Cannot link an entity to itself');
  const from = await entity(tx, input.fromId);
  await entity(tx, input.toId);
  const structural = await tx.query(
    `SELECT id FROM records WHERE id=$1 AND "collectionId"=$2
    UNION ALL SELECT id FROM tasks WHERE id=$1 AND "sourceId"=$2`,
    [input.fromId, input.toId],
  );
  if (structural.rowCount) throw new Problem(409, 'Structural relationships are not Links');
  if (input.fieldId) {
    if (from.type !== 'Record') throw new Problem(400, 'Only Records have reference fields');
    const collection = (
      await tx.query(
        'SELECT c.fields FROM collections c JOIN records r ON r."collectionId"=c.id WHERE r.id=$1',
        [input.fromId],
      )
    ).rows[0];
    const siblings = (
      await tx.query('SELECT * FROM links WHERE "fromId"=$1 AND "fieldId"=$2', [
        input.fromId,
        input.fieldId,
      ])
    ).rows;
    await validReference(tx, collection.fields, input, siblings);
  }
  return (
    await tx.query(
      `INSERT INTO links ("fromId","toId","fieldId",context) VALUES ($1,$2,$3,$4)
    ON CONFLICT ("fromId","toId","fieldId") DO UPDATE SET context=excluded.context RETURNING *`,
      [input.fromId, input.toId, input.fieldId ?? null, input.context ?? null],
    )
  ).rows[0];
}

/** Save one selected association, with no action side effects. */
export async function saveLink(db: Database, input: LinkInput) {
  validate(linkSchema, input);
  input = structuredClone(input);
  return transaction(db, async (tx) => {
    await lockForms(tx);
    return insertLink(tx, input);
  });
}
/** Remove the exact association, including the reference field value if present. */
export async function removeLink(db: Database, input: LinkInput) {
  validate(linkSchema, input);
  return transaction(db, async (tx) => {
    await lockForms(tx);
    await tx.query(
      'DELETE FROM links WHERE "fromId"=$1 AND "toId"=$2 AND "fieldId" IS NOT DISTINCT FROM $3::uuid',
      [input.fromId, input.toId, input.fieldId ?? null],
    );
    return { removed: true };
  });
}
/** Reference search deliberately returns metadata only. */
export async function searchReferences(db: Database, text: string, collectionId?: string) {
  if (collectionId) validate(idSchema, collectionId);
  return (
    await db.query(
      `SELECT id,title,type FROM (${entitiesSql}) e WHERE "archivedAt" IS NULL AND title ILIKE $1
    AND ($2::uuid IS NULL OR id IN (SELECT id FROM records WHERE "collectionId"=$2)) ORDER BY title,id LIMIT 30`,
      [`%${text.replace(/[\\%_]/g, '\\$&')}%`, collectionId ?? null],
    )
  ).rows;
}
/** Return incoming and outgoing links with endpoint titles, never content bodies. */
export async function queryLinks(db: Database, id: string) {
  validate(idSchema, id);
  return (
    await db.query(
      `WITH e AS (${entitiesSql}) SELECT l.*,f.title AS "fromTitle",t.title AS "toTitle" FROM links l
    JOIN e f ON f.id=l."fromId" JOIN e t ON t.id=l."toId" WHERE l."fromId"=$1 OR l."toId"=$1 ORDER BY l."fromId",l."toId",l."fieldId"`,
      [id],
    )
  ).rows;
}
/** Hiding is reversible; removal atomically deletes the definition and its values. */
export async function removeField(
  db: Database,
  collectionId: string,
  fieldId: string,
  scope: 'hide' | 'delete',
) {
  validate(idSchema, collectionId);
  validate(idSchema, fieldId);
  if (!['hide', 'delete'].includes(scope)) throw new Problem(400, 'Invalid scope');
  return transaction(db, async (tx) => {
    await lockForms(tx);
    const collection = (
      await tx.query('SELECT fields FROM collections WHERE id=$1 FOR UPDATE', [collectionId])
    ).rows[0];
    if (!collection?.fields.some((f: Field) => f.id === fieldId))
      throw new Problem(404, 'Field not found');
    const fields = (collection.fields as Field[]).flatMap((f) =>
      f.id !== fieldId ? [f] : scope === 'hide' ? [{ ...f, hidden: true }] : [],
    );
    if (scope === 'delete') {
      await tx.query(
        'DELETE FROM links WHERE "fieldId"=$1 AND "fromId" IN (SELECT id FROM records WHERE "collectionId"=$2)',
        [fieldId, collectionId],
      );
      await tx.query(
        'UPDATE records SET values=values-$1,"updatedAt"=clock_timestamp() WHERE "collectionId"=$2 AND values ? $1',
        [fieldId, collectionId],
      );
    }
    await tx.query('UPDATE collections SET fields=$2,"updatedAt"=clock_timestamp() WHERE id=$1', [
      collectionId,
      JSON.stringify(fields),
    ]);
  });
}
/** Internal editing preserves original text and does not repeat processing effects. */
export async function updateContent(
  db: Database,
  id: string,
  editedText: string,
): Promise<Content> {
  validate(idSchema, id);
  validate(textSchema, editedText);
  const result = await db.query(
    'UPDATE content SET "editedText"=$2,title=$3,"updatedAt"=clock_timestamp() WHERE id=$1 AND "classifiedAt" IS NOT NULL RETURNING *',
    [id, editedText, editedText.trim().split(/\r?\n/)[0]],
  );
  if (!result.rows[0]) throw new Problem(409, 'Content missing or processing is pending');
  return result.rows[0];
}
/** Internal lookup does not expand the launcher REST surface. */
export async function queryContent(db: Database, id: string): Promise<Content> {
  validate(idSchema, id);
  const row = (await db.query('SELECT * FROM content WHERE id=$1', [id])).rows[0];
  if (!row) throw new Problem(404, 'Content not found');
  return row;
}
/** Archive one entity without deleting or cascading its relationships. */
export async function archive(db: Database, id: string, archived: boolean) {
  validate(idSchema, id);
  validate(Type.Boolean(), archived);
  return transaction(db, async (tx) => {
    const found = await entity(tx, id);
    const table = {
      Entry: 'content',
      Note: 'content',
      Collection: 'collections',
      Record: 'records',
      Task: 'tasks',
    }[found.type];
    await tx.query(
      `UPDATE ${table} SET "archivedAt"=CASE WHEN $2 THEN now() ELSE NULL END,"updatedAt"=clock_timestamp() WHERE id=$1`,
      [id, archived],
    );
  });
}
