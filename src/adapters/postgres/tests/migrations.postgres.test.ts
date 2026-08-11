import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../../../tests/postgres/database.js';
import { PostgresDatabase } from '../database.js';

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: testDatabaseUrl(), max: 2 });
});

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL 18.4 baseline migrations', () => {
  it('applies the system and telemetry baselines to an empty database', async () => {
    const version = await pool.query<{ server_version: string }>('SHOW server_version');
    const tables = await pool.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('public', 'telemetry')
      ORDER BY table_schema, table_name
    `);

    expect(version.rows[0]?.server_version).toMatch(/^18\.4/);
    expect(tables.rows).toContainEqual({
      table_schema: 'public',
      table_name: 'interpretation_claims',
    });
    expect(tables.rows).toContainEqual({ table_schema: 'telemetry', table_name: 'runs' });
    expect(tables.rows.some(({ table_name }) => table_name === 'notifications')).toBe(false);
    expect(tables.rows.some(({ table_name }) => table_name === 'proactivity')).toBe(false);
  });

  it('keeps functional tables out of the telemetry schema', async () => {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'telemetry'
    `);

    expect(result.rows.map(({ table_name }) => table_name)).toEqual(['runs']);
  });

  it('passes application readiness only at the required migration level', async () => {
    const database = new PostgresDatabase({
      connectionString: testDatabaseUrl(),
      maxConnections: 1,
    });
    await expect(database.assertReady()).resolves.toBeUndefined();
    await expect(database.isReady()).resolves.toBe(true);
    await database.close();
  });
});
