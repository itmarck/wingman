import {
  type Database,
  entitiesSql,
  entity,
  type Transaction,
  transaction,
} from '../platform/storage.js';
import { idSchema, type LinkInput, linkSchema, Problem, validate } from './model.js';

/** Insert one association after validating both ends exist; links never execute anything. */
export async function insertLink(tx: Transaction, input: LinkInput) {
  if (input.fromId === input.toId) throw new Problem(400, 'Cannot link an item to itself');
  const from = await entity(tx, input.fromId);
  const to = await entity(tx, input.toId);
  const structural = await tx.query(
    `SELECT 1 FROM records WHERE id=$1 AND "collectionId"=$2
    UNION ALL SELECT 1 FROM entries WHERE (id=$1 AND "parentId"=$2) OR (id=$2 AND "parentId"=$1)`,
    [input.fromId, input.toId],
  );
  if (structural.rowCount) throw new Problem(409, 'Structural relationships are not links');
  if (input.fieldId && (from.type !== 'record' || to.type !== 'record'))
    throw new Problem(400, 'Only links between Records have a field');
  return (
    await tx.query(
      `INSERT INTO links ("fromId","toId","fieldId",note) VALUES ($1,$2,$3,$4)
      ON CONFLICT ("fromId","toId","fieldId") DO UPDATE SET note=excluded.note RETURNING *`,
      [input.fromId, input.toId, input.fieldId ?? null, input.note ?? null],
    )
  ).rows[0];
}

/** Link any item to another, chosen manually (for example with @ in the launcher). */
export async function saveLink(db: Database, fromId: string, input: Omit<LinkInput, 'fromId'>) {
  validate(idSchema, fromId);
  validate(linkSchema, input);
  return transaction(db, (tx) => insertLink(tx, { ...input, fromId }));
}

/** Remove one association in either direction. */
export async function removeLink(db: Database, id: string, otherId: string) {
  validate(idSchema, id);
  validate(idSchema, otherId);
  const result = await db.query(
    `DELETE FROM links WHERE "fieldId" IS NULL AND
    (("fromId"=$1 AND "toId"=$2) OR ("fromId"=$2 AND "toId"=$1))`,
    [id, otherId],
  );
  if (!result.rowCount) throw new Problem(404, 'Link not found');
  return { removed: result.rowCount };
}

/** Outgoing and incoming links with the other end's title and type; inverses are queried. */
export async function listLinks(db: Database, id: string) {
  validate(idSchema, id);
  return (
    await db.query(
      `WITH e AS (${entitiesSql})
      SELECT l.*, CASE WHEN l."fromId"=$1 THEN 'outgoing' ELSE 'incoming' END AS direction,
        o.id AS "otherId", o.title AS "otherTitle", o.type AS "otherType"
      FROM links l JOIN e o ON o.id = CASE WHEN l."fromId"=$1 THEN l."toId" ELSE l."fromId" END
      WHERE l."fromId"=$1 OR l."toId"=$1 ORDER BY l."createdAt"`,
      [id],
    )
  ).rows;
}

/**
 * Text search over Entries, Collections and Records: Spanish full text without accents,
 * plus trigram similarity for typos.
 */
export async function search(db: Database, text: string, limit = 30) {
  const query = text.trim();
  if (!query || query.length > 200) throw new Problem(400, 'Invalid search');
  return (
    await db.query(
      `WITH e AS (SELECT id, type, title, unaccent(lower(concat_ws(' ', title, body))) AS document
        FROM (${entitiesSql}) items WHERE "archivedAt" IS NULL),
      q AS (SELECT unaccent(lower($1)) AS text)
      SELECT id, type, title,
        ts_rank(to_tsvector('spanish', document), websearch_to_tsquery('spanish', q.text)) AS rank,
        word_similarity(q.text, document) AS similarity
      FROM e, q
      WHERE to_tsvector('spanish', document) @@ websearch_to_tsquery('spanish', q.text)
        OR word_similarity(q.text, document) >= 0.5
      ORDER BY rank DESC, similarity DESC, title LIMIT $2`,
      [query, limit],
    )
  ).rows;
}
