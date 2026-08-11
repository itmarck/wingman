import { describe, expect, it } from 'vitest';
import { readPostgresConfig } from '../config.js';

describe('PostgreSQL configuration', () => {
  it('uses the connection string and a small default pool', () => {
    expect(
      readPostgresConfig({
        DATABASE_URL: 'postgresql://localhost/wingman',
      }),
    ).toEqual({
      connectionString: 'postgresql://localhost/wingman',
      maxConnections: 5,
    });
  });

  it('rejects missing connection details and invalid pool sizes', () => {
    expect(() => readPostgresConfig({})).toThrow('DATABASE_URL is required');
    expect(() =>
      readPostgresConfig({
        DATABASE_URL: 'postgresql://localhost/wingman',
        POSTGRES_POOL_MAX: '0',
      }),
    ).toThrow('POSTGRES_POOL_MAX must be a positive integer');
  });
});
