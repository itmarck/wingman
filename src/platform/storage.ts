import { Pool, type PoolClient, types } from 'pg';
import { Problem } from '../core/model.js';

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => Number(value));
types.setTypeParser(20, (value) => Number(value));
export type Database = Pool;
export type Transaction = PoolClient;
/** Open PostgreSQL with bounded connection and statement waits. */
export function database(connectionString: string): Database {
  return new Pool({
    connectionString,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
}
/** Keep inseparable writes atomic; never call external services here. */
export async function transaction<T>(
  db: Database,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await operation(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
export type EntityType = 'entry' | 'collection' | 'record';
/** Every linkable item; ids are unique UUIDs across tables. */
export const entitiesSql = `SELECT id, kind AS type, title, coalesce("editedText", text) AS body, "archivedAt" FROM entries
  UNION ALL SELECT id, 'collection', name, NULL, "archivedAt" FROM collections
  UNION ALL SELECT id, 'record', title, concat_ws(' ', subtitle, category, body), "archivedAt" FROM records`;
/** Resolve one existing item without a universal entity table. */
export async function entity(tx: Database | Transaction, id: string) {
  const row = (
    await tx.query(
      `SELECT id, title, CASE WHEN type IN ('note','task','project') THEN 'entry' ELSE type END AS type,
      type AS kind, "archivedAt" FROM (${entitiesSql}) e WHERE id=$1`,
      [id],
    )
  ).rows[0];
  if (!row) throw new Problem(404, 'Item not found');
  return row as {
    id: string;
    title: string;
    type: EntityType;
    kind: string;
    archivedAt: Date | null;
  };
}
/** Serialize Collection definition and Record form writes against each other. */
export async function lockForms(tx: Transaction): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(734921)');
}
