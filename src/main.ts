import { readConfig } from './adapters/config.js';
import { createServer, type Server } from './adapters/http/start.js';
import { createInferenceAdapter } from './adapters/inference/adapter.js';
import { PostgresDatabase } from './adapters/postgres/database.js';
import { createPostgresStorage } from './adapters/postgres/storage.js';
import { PostgresInferenceTelemetry } from './adapters/postgres/telemetry.js';
import { createKnowledgeRegistry } from './core/item/system.js';
import { PollingWorker } from './modules/interpretation/adapters/worker.js';
import { Runtime } from './runtime.js';
import { createSystem, type System } from './system/system.js';
import { SystemWorkCommand } from './system/work.js';

const config = readConfig();
const database = new PostgresDatabase(config.postgres);
const application = await startRuntime(database);

async function stop(signal: NodeJS.Signals): Promise<void> {
  try {
    await application.runtime.close(signal);
  } catch (error) {
    application.server.logger.error({ error }, 'Runtime did not stop cleanly');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

async function startRuntime(
  database: PostgresDatabase,
): Promise<{ readonly runtime: Runtime; readonly server: Server }> {
  let system: System | undefined;
  let server: Server | undefined;
  let owner: Runtime | undefined;

  try {
    const registry = createKnowledgeRegistry();
    system = createSystem(createPostgresStorage(database, registry), {
      adapter: createInferenceAdapter(config.inference),
      inference: {
        target: config.inference.target,
        provider: config.inference.provider,
        model: config.inference.model,
      },
      mode: config.system.mode,
      telemetry: new PostgresInferenceTelemetry(database),
      registry,
    });
    server = createServer(system, config.http, () => database.isReady());
    const worker = new PollingWorker(
      new SystemWorkCommand(
        system.interpretation.processNext,
        system.automation.worker,
        system.execution.worker,
      ),
      {
        onError: (error) => server?.logger.error({ error }, 'System work failed'),
      },
    );
    owner = new Runtime({ server, worker, system, database });
    await owner.start();
    return Object.freeze({ runtime: owner, server });
  } catch (error) {
    if (!owner) await closePartial(server, system, database, error);
    throw error;
  }
}

async function closePartial(
  server: Server | undefined,
  system: System | undefined,
  database: PostgresDatabase,
  startupError: unknown,
): Promise<void> {
  const errors: unknown[] = [startupError];
  for (const close of [
    server ? () => server.close() : undefined,
    system ? () => system.close() : undefined,
    () => database.close(),
  ]) {
    try {
      await close?.();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 1) throw new AggregateError(errors, 'Runtime composition and cleanup failed');
}
