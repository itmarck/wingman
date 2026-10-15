import { Type } from 'typebox';
import { type Database, lockForms, type Transaction, transaction } from '../platform/storage.js';
import { instant, timezoneValid } from './dates.js';
import { insertLink } from './links.js';
import {
  type CollectionInput,
  type CollectionPatch,
  collectionPatchSchema,
  collectionSchema,
  type Field,
  fieldsValid,
  idSchema,
  Problem,
  type RecordInput,
  type RecordPatch,
  recordPatchSchema,
  recordSchema,
  settingsCollectionId,
  urlValid,
  validate,
  valuesValid,
} from './model.js';

/** Valid setting keys, their defaults and validation; Records of Settings hold the values. */
export const settingDefinitions = {
  timezone: {
    default: 'America/Lima',
    description: "The user's IANA timezone, for local days (today, tomorrow, journal days)",
    parse: (value: string) => (timezoneValid(value) ? value : undefined),
  },
  nowLimit: {
    default: 5,
    description: 'How many tasks the now view shows (1-20)',
    parse: (value: string) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= 1 && number <= 20 ? number : undefined;
    },
  },
};
export type SettingKey = keyof typeof settingDefinitions;
export type Settings = { [K in SettingKey]: (typeof settingDefinitions)[K]['default'] };

/** Resolve every setting; a missing or invalid value falls back to its default. */
export async function readSettings(db: Database | Transaction): Promise<Settings> {
  const rows = (
    await db.query(
      'SELECT title, body FROM records WHERE "collectionId"=$1 AND "archivedAt" IS NULL',
      [settingsCollectionId],
    )
  ).rows as { title: string; body: string | null }[];
  const settings: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(settingDefinitions)) {
    const row = rows.find((row) => row.title === key);
    settings[key] =
      (row?.body != null ? definition.parse(row.body) : undefined) ?? definition.default;
  }
  return settings as Settings;
}

/** Save one setting as a Settings Record; only known keys with valid values. */
export async function saveSetting(db: Database, key: string, value: string) {
  const definition = settingDefinitions[key as SettingKey];
  if (!definition) throw new Problem(400, 'Unknown setting');
  if (definition.parse(value) === undefined) throw new Problem(400, 'Invalid setting value');
  await db.query(
    `INSERT INTO records ("collectionId", title, body) VALUES ($1,$2,$3)
    ON CONFLICT (title) WHERE "collectionId"='${settingsCollectionId}' AND "archivedAt" IS NULL
    DO UPDATE SET body=excluded.body, "updatedAt"=clock_timestamp()`,
    [settingsCollectionId, key, value],
  );
  return readSettings(db);
}

/** List active Collections with their Record counts. */
export async function listCollections(db: Database, archived = false) {
  return (
    await db.query(
      `SELECT c.*, (SELECT count(*) FROM records r WHERE r."collectionId"=c.id AND r."archivedAt" IS NULL) AS records
      FROM collections c WHERE ("archivedAt" IS NOT NULL)=$1 ORDER BY name, id`,
      [archived],
    )
  ).rows;
}

/** Create a Collection; definitions only describe the general columns. */
export async function createCollection(db: Database, input: CollectionInput) {
  validate(collectionSchema, input);
  fieldsValid(input.fields ?? []);
  return transaction(db, async (tx) => {
    await lockForms(tx);
    await referenceTargets(tx, input.fields ?? []);
    return (
      await tx.query(
        'INSERT INTO collections (name, area, definitions, fields) VALUES ($1,$2,$3,$4) RETURNING *',
        [
          input.name.trim(),
          input.area ?? null,
          JSON.stringify(input.definitions ?? {}),
          JSON.stringify(input.fields ?? []),
        ],
      )
    ).rows[0];
  });
}

/** Update a Collection only if every existing value stays valid; removed fields lose their data. */
export async function updateCollection(db: Database, id: string, patch: CollectionPatch) {
  validate(idSchema, id);
  validate(collectionPatchSchema, patch);
  return transaction(db, async (tx) => {
    await lockForms(tx);
    const previous = (await tx.query('SELECT * FROM collections WHERE id=$1 FOR UPDATE', [id]))
      .rows[0];
    if (!previous) throw new Problem(404, 'Collection not found');
    const next = { ...previous, ...patch };
    if (patch.fields) {
      fieldsValid(patch.fields);
      await referenceTargets(tx, patch.fields);
      const removed = (previous.fields as Field[]).filter(
        (field) => !patch.fields?.some((next) => next.id === field.id),
      );
      for (const field of removed) {
        await tx.query('UPDATE records SET values=values-$1 WHERE "collectionId"=$2', [
          field.id,
          id,
        ]);
        await tx.query(
          'DELETE FROM links WHERE "fieldId"=$1 AND "fromId" IN (SELECT id FROM records WHERE "collectionId"=$2)',
          [field.id, id],
        );
      }
      const records = await tx.query('SELECT values FROM records WHERE "collectionId"=$1', [id]);
      for (const record of records.rows) valuesValid(patch.fields, record.values);
    }
    return (
      await tx.query(
        `UPDATE collections SET name=$2, area=$3, definitions=$4, fields=$5, "updatedAt"=clock_timestamp()
        WHERE id=$1 RETURNING *`,
        [
          id,
          next.name.trim(),
          next.area,
          JSON.stringify(next.definitions),
          JSON.stringify(next.fields),
        ],
      )
    ).rows[0];
  });
}

async function referenceTargets(tx: Transaction, fields: Field[]) {
  for (const field of fields.filter((field) => field.collectionId)) {
    const found = await tx.query('SELECT id FROM collections WHERE id=$1', [field.collectionId]);
    if (!found.rowCount) throw new Problem(400, 'Reference target Collection not found');
  }
}

/** One Collection's Records with their reference links; Records use the Collection area. */
export async function listRecords(db: Database, collectionId: string, offset = 0) {
  validate(idSchema, collectionId);
  validate(Type.Integer({ minimum: 0 }), offset);
  const collection = (await db.query('SELECT * FROM collections WHERE id=$1', [collectionId]))
    .rows[0];
  if (!collection) throw new Problem(404, 'Collection not found');
  const records = (
    await db.query(
      `SELECT r.*, (SELECT coalesce(jsonb_object_agg(f."fieldId", f.ids), '{}') FROM
        (SELECT "fieldId", jsonb_agg("toId") AS ids FROM links WHERE "fromId"=r.id AND "fieldId" IS NOT NULL GROUP BY "fieldId") f) AS references
      FROM records r WHERE r."collectionId"=$1 AND r."archivedAt" IS NULL
      ORDER BY r."createdAt" DESC, r.id LIMIT 200 OFFSET $2`,
      [collectionId, offset],
    )
  ).rows;
  return { collection, records };
}

/** Create a Record in a Collection. */
export async function createRecord(db: Database, collectionId: string, input: RecordInput) {
  validate(recordSchema, input);
  return writeRecord(db, collectionId, undefined, input);
}

/** Patch a Record; null clears a column, omitted properties stay. */
export async function updateRecord(db: Database, id: string, patch: RecordPatch) {
  validate(idSchema, id);
  validate(recordPatchSchema, patch);
  const found = (await db.query('SELECT "collectionId" FROM records WHERE id=$1', [id])).rows[0];
  if (!found) throw new Problem(404, 'Record not found');
  return writeRecord(db, found.collectionId, id, patch);
}

const columns = ['title', 'subtitle', 'body', 'category', 'rating', 'amount', 'url'] as const;

async function writeRecord(
  db: Database,
  collectionId: string,
  id: string | undefined,
  input: RecordPatch,
) {
  validate(idSchema, collectionId);
  urlValid(input.url);
  return transaction(db, async (tx) => {
    await lockForms(tx);
    const { timezone } = await readSettings(tx);
    const collection = (
      await tx.query('SELECT fields FROM collections WHERE id=$1 AND "archivedAt" IS NULL', [
        collectionId,
      ])
    ).rows[0];
    if (!collection) throw new Problem(404, 'Collection not found');
    const previous = id
      ? (await tx.query('SELECT * FROM records WHERE id=$1 FOR UPDATE', [id])).rows[0]
      : {};
    const values = { ...previous.values, ...input.values };
    valuesValid(collection.fields, values);
    const row: Record<string, unknown> = { ...previous };
    for (const column of columns) if (input[column] !== undefined) row[column] = input[column];
    for (const column of ['occurredAt', 'dueAt'] as const) {
      const value = input[column];
      if (value !== undefined) row[column] = value === null ? null : instant(value, timezone);
    }
    const params = [
      ...columns.map((column) => row[column] ?? null),
      row.occurredAt ?? null,
      row.dueAt ?? null,
      JSON.stringify(values),
    ];
    const saved = id
      ? await tx.query(
          `UPDATE records SET title=$2, subtitle=$3, body=$4, category=$5, rating=$6, amount=$7, url=$8,
          "occurredAt"=$9, "dueAt"=$10, values=$11, "updatedAt"=clock_timestamp() WHERE id=$1 RETURNING *`,
          [id, ...params],
        )
      : await tx.query(
          `INSERT INTO records ("collectionId", title, subtitle, body, category, rating, amount, url, "occurredAt", "dueAt", values)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [collectionId, ...params],
        );
    const record = saved.rows[0];
    for (const [fieldId, ids] of Object.entries(input.references ?? {})) {
      const field = (collection.fields as Field[]).find((field) => field.id === fieldId);
      if (field?.type !== 'reference') throw new Problem(400, 'Unknown reference field');
      if (!field.multiple && ids.length > 1) throw new Problem(400, 'Reference accepts one value');
      await tx.query('DELETE FROM links WHERE "fromId"=$1 AND "fieldId"=$2', [record.id, fieldId]);
      for (const toId of ids) {
        if (field.collectionId) {
          const target = await tx.query(
            'SELECT id FROM records WHERE id=$1 AND "collectionId"=$2',
            [toId, field.collectionId],
          );
          if (!target.rowCount) throw new Problem(400, 'Reference belongs to another Collection');
        }
        await insertLink(tx, { fromId: record.id, toId, fieldId });
      }
    }
    return record;
  });
}
