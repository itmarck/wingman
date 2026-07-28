import { Pool } from 'pg';
import type { PostgresConfig } from './config.js';

export interface DatabaseResult<Row> {
  readonly rows: readonly Row[];
}

/**
 * Minimal database surface shared by PostgreSQL infrastructure adapters.
 */
export interface Database {
  query<Row>(statement: string, parameters?: readonly unknown[]): Promise<DatabaseResult<Row>>;
  close(): Promise<void>;
}

/**
 * Hides connection pooling and driver details behind the database surface.
 */
export class PostgresDatabase implements Database {
  readonly #pool: Pool;

  constructor(config: PostgresConfig) {
    this.#pool = new Pool({
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

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
