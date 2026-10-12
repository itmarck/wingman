import { startProcessor } from '../core/processing.js';
import { createClassifier } from './decisions.js';
import { createServer } from './http.js';
import { database } from './storage.js';
import { track } from './telemetry.js';

const decisionModel = 'jev-1.13.0';

/** Start HTTP and the Processor together; stop before closing their shared pool. */
export async function start(env: NodeJS.ProcessEnv = process.env) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const url = required('DATABASE_URL');
  const secret = required('SERVER_SECRET');
  const classify = createClassifier(required('TYPESAFE_API_KEY'), decisionModel);
  const port = Number(env.PORT ?? env.SERVER_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HTTP port');
  const db = database(url);
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await db.query('SELECT 1 FROM collections LIMIT 1');
    server = await createServer(db, secret, env.NODE_ENV === 'development');
    await server.listen({ host: '0.0.0.0', port });
    const log = server.log;
    const stopProcessor = startProcessor(db, classify, (error) => {
      log.error(error);
      track(db, 'processorError', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const http = server;
    let closing: Promise<void> | undefined;
    return () =>
      (closing ??= (async () => {
        try {
          await Promise.all([http.close(), stopProcessor()]);
        } finally {
          await db.end();
        }
      })());
  } catch (error) {
    await server?.close();
    await db.end();
    throw error;
  }
}
