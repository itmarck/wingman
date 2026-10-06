import { Pool, type PoolClient, types } from 'pg';
import { Problem } from '../core/model.js';

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => Number(value));
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
export const entitiesSql = `SELECT id, title, "inputMode" AS type, "archivedAt" FROM content
  UNION ALL SELECT id, name, 'Collection', "archivedAt" FROM collections
  UNION ALL SELECT id, title, 'Record', "archivedAt" FROM records
  UNION ALL SELECT id, title, 'Task', "archivedAt" FROM tasks`;
/** Resolve admitted identities without a universal entity table. */
export async function entity(tx: Transaction, id: string) {
  const result = await tx.query(`SELECT id,title,type FROM (${entitiesSql}) e WHERE id=$1`, [id]);
  if (!result.rows[0]) throw new Problem(404, 'Entity not found');
  return result.rows[0] as {
    id: string;
    title: string;
    type: 'Entry' | 'Note' | 'Collection' | 'Record' | 'Task';
  };
}
/** Serialize the small form/reference write surface against schema changes. */
export async function lockForms(tx: Transaction): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(734921)');
}
