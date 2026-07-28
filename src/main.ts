import { readConfig } from './adapters/config.js';
import { createServer } from './adapters/http/start.js';
import { PostgresDatabase } from './adapters/postgres/database.js';
import { PostgresInferenceTelemetry } from './adapters/postgres/telemetry.js';
import { PollingWorker } from './modules/interpretation/adapters/worker.js';
import { Runtime } from './runtime.js';
import { createSystem } from './system/system.js';

const config = readConfig();
const database = new PostgresDatabase(config.postgres);
const system = createSystem('memory', {
  inference: config.inference,
  mode: config.system.mode,
  telemetry: new PostgresInferenceTelemetry(database),
});
const server = createServer(system, config.http);
const worker = new PollingWorker(system.interpretation.processNext, {
  onError: (error) => server.logger.error({ error }, 'Entry processing failed'),
});
const runtime = new Runtime({ server, worker, system, database });

await runtime.start();

async function stop(signal: NodeJS.Signals): Promise<void> {
  try {
    await runtime.close(signal);
  } catch (error) {
    server.logger.error({ error }, 'Runtime did not stop cleanly');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));
