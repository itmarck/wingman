import { Pool, type PoolClient } from 'pg';
import type { PostgresConfig } from './config.js';

export interface DatabaseResult<Row> {
  readonly rows: readonly Row[];
}

/**
 * Minimal database surface shared by PostgreSQL infrastructure adapters.
 */
export interface QueryableDatabase {
  query<Row>(statement: string, parameters?: readonly unknown[]): Promise<DatabaseResult<Row>>;
}

export interface Database extends QueryableDatabase {
  transaction<Value>(action: (database: QueryableDatabase) => Promise<Value>): Promise<Value>;
  assertReady(): Promise<void>;
  isReady(): Promise<boolean>;
  close(): Promise<void>;
}

/** Uses an owned pool transaction when available and reuses an existing transaction otherwise. */
export function inTransaction<Value>(
  database: QueryableDatabase,
  action: (transaction: QueryableDatabase) => Promise<Value>,
): Promise<Value> {
  return 'transaction' in database && typeof database.transaction === 'function'
    ? (database as Database).transaction(action)
    : action(database);
}

interface PoolLike {
  query(statement: string, parameters?: readonly unknown[]): Promise<{ readonly rows: unknown[] }>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

/**
 * Hides connection pooling and driver details behind the database surface.
 */
export class PostgresDatabase implements Database {
  readonly #pool: PoolLike;

  constructor(config: PostgresConfig, pool?: PoolLike) {
    this.#pool =
      pool ??
      new Pool({
        application_name: 'wingman',
        connectionString: config.connectionString,
        max: config.maxConnections,
      });
  }

  async query<Row>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult<Row>> {
    const result = await this.#pool.query(statement, [...parameters]);

    return Object.freeze({
      rows: Object.freeze(result.rows as Row[]),
    });
  }

  async transaction<Value>(
    action: (database: QueryableDatabase) => Promise<Value>,
  ): Promise<Value> {
    const client = await this.#pool.connect();
    const database: QueryableDatabase = Object.freeze({
      async query<Row>(statement: string, parameters: readonly unknown[] = []) {
        const result = await client.query(statement, [...parameters]);
        return Object.freeze({ rows: Object.freeze(result.rows as Row[]) });
      },
    });

    try {
      await client.query('BEGIN');
      const value = await action(database);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Database transaction rollback failed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async assertReady(): Promise<void> {
    const result = await this.query<{ name: string }>(
      `SELECT name FROM pgmigrations
       WHERE name = ANY($1::text[]) ORDER BY name`,
      [['001_system', '002_telemetry']],
    );
    const names = result.rows.map(({ name }) => name);
    if (names.length !== 2) {
      throw new Error('PostgreSQL migrations are not current');
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.assertReady();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
