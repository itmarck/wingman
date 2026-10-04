import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { Client } from 'pg';

const execute = promisify(execFile);

/** Creates and removes one owned database on the explicitly configured test PostgreSQL. */
export default async function setup(): Promise<() => Promise<void>> {
  const adminUrl = process.env.WINGMAN_TEST_POSTGRES_URL;
  if (!adminUrl) {
    throw new Error('WINGMAN_TEST_POSTGRES_URL is required; see README.md');
  }
  const databaseName = `wingman_test_${randomUUID().replaceAll('-', '')}`;
  const connection = new URL(adminUrl);
  connection.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  let created = false;

  const cleanup = async () => {
    delete process.env.WINGMAN_TEST_DATABASE_URL;
    try {
      if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };

  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    process.env.WINGMAN_TEST_DATABASE_URL = connection.toString();
    await execute(
      process.execPath,
      [
        './node_modules/node-pg-migrate/bin/node-pg-migrate.js',
        'up',
        '--migrations-dir',
        'migrations',
        '--check-order',
        '--single-transaction',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: connection.toString() },
      },
    );
    return cleanup;
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Test database setup and cleanup failed');
    }
    throw error;
  }
}
