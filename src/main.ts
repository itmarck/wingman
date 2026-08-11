import { readConfig } from './adapters/config.js';
import { createServer } from './adapters/http/start.js';
import { createInferenceAdapter } from './adapters/inference/adapter.js';
import { PostgresDatabase } from './adapters/postgres/database.js';
import { PostgresInferenceTelemetry } from './adapters/postgres/telemetry.js';
import { PollingWorker } from './modules/interpretation/adapters/worker.js';
import { Runtime } from './runtime.js';
import { createSystem } from './system/system.js';
import { SystemWorkCommand } from './system/work.js';

const config = readConfig();
const database = new PostgresDatabase(config.postgres);
const system = createSystem('memory', {
  adapter: createInferenceAdapter(config.inference),
  inference: {
    target: config.inference.target,
    provider: config.inference.provider,
    model: config.inference.model,
  },
  mode: config.system.mode,
  telemetry: new PostgresInferenceTelemetry(database),
});
const server = createServer(system, config.http);
const worker = new PollingWorker(
  new SystemWorkCommand(
    system.interpretation.processNext,
    system.automation.worker,
    system.execution.worker,
  ),
  {
    onError: (error) => server.logger.error({ error }, 'System work failed'),
  },
);
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
