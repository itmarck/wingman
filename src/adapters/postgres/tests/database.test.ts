import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PostgresDatabase } from '../database.js';

describe('PostgresDatabase transactions', () => {
  it('commits and releases after a successful callback', async () => {
    const { database, statements, release } = createDatabase();

    const value = await database.transaction(async (transaction) => {
      await transaction.query('INSERT INTO example VALUES ($1)', ['value']);
      return 42;
    });

    expect(value).toBe(42);
    expect(statements).toEqual(['BEGIN', 'INSERT INTO example VALUES ($1)', 'COMMIT']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases when the callback fails', async () => {
    const { database, statements, release } = createDatabase();

    await expect(
      database.transaction(async () => {
        throw new Error('injected failure');
      }),
    ).rejects.toThrow('injected failure');

    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });
});

function createDatabase() {
  const statements: string[] = [];
  const release = vi.fn();
  const client = {
    async query(statement: string) {
      statements.push(statement);
      return { rows: [] };
    },
    release,
  } as unknown as PoolClient;
  const pool = {
    async query() {
      return { rows: [] };
    },
    async connect() {
      return client;
    },
    async end() {},
  };
  return {
    database: new PostgresDatabase(
      { connectionString: 'postgresql://unused', maxConnections: 1 },
      pool,
    ),
    statements,
    release,
  };
}
