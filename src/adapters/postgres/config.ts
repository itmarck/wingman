export interface PostgresConfig {
  readonly connectionString: string;
  readonly maxConnections: number;
}

/**
 * Reads the minimal PostgreSQL configuration required by the infrastructure adapter.
 */
export function readPostgresConfig(environment = process.env): PostgresConfig {
  const connectionString = environment.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return Object.freeze({
    connectionString,
    maxConnections: readPositiveInteger(environment.POSTGRES_POOL_MAX, 10),
  });
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  const isPositiveInteger = Number.isInteger(parsed) && parsed > 0;

  if (!isPositiveInteger) {
    throw new Error('POSTGRES_POOL_MAX must be a positive integer');
  }

  return parsed;
}
