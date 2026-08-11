import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import EmbeddedPostgres from 'embedded-postgres';

const execute = promisify(execFile);

/** Starts the harness-owned PostgreSQL 18.4 cluster used by one Vitest project. */
export default async function setup(): Promise<() => Promise<void>> {
  const ownerDirectory = await mkdtemp(join(tmpdir(), 'wingman-postgres-'));
  const databaseDirectory = join(ownerDirectory, 'cluster');
  const port = await findAvailablePort();
  const user = 'wingman_test';
  const password = 'wingman_test';
  const databaseName = 'wingman';
  const postgres = new EmbeddedPostgres({
    databaseDir: databaseDirectory,
    port,
    user,
    password,
    persistent: true,
    onLog: () => undefined,
    onError: (error) => console.error(error),
  });
  let started = false;

  try {
    await postgres.initialise();
    await postgres.start();
    started = true;
    await postgres.createDatabase(databaseName);
    const connectionString = `postgresql://${user}:${password}@127.0.0.1:${port}/${databaseName}`;
    process.env.WINGMAN_TEST_DATABASE_URL = connectionString;
    await execute(
      process.execPath,
      ['./node_modules/node-pg-migrate/bin/node-pg-migrate.js', 'up'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
        },
      },
    );

    return async () => {
      delete process.env.WINGMAN_TEST_DATABASE_URL;
      await stopAndClean(postgres, ownerDirectory, true);
    };
  } catch (error) {
    await stopAndClean(postgres, ownerDirectory, started);
    throw error;
  }
}

async function stopAndClean(
  postgres: EmbeddedPostgres,
  ownerDirectory: string,
  started: boolean,
): Promise<void> {
  const errors: unknown[] = [];
  if (started) {
    try {
      await postgres.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await rm(ownerDirectory, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Embedded PostgreSQL cleanup failed');
}

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!port) throw new Error('Could not allocate an embedded PostgreSQL port');
  return port;
}
