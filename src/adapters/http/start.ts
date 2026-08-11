import type { System } from '../../system/system.js';
import type { HttpConfig } from './config.js';
import { createLoggerOptions } from './logging.js';
import { createHttpServer } from './server.js';

export interface ServerLogger {
  info(context: object, message: string): void;
  error(context: object, message: string): void;
}

export interface Server {
  readonly logger: ServerLogger;
  start(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates a framework-independent HTTP server lifecycle.
 */
export function createServer(
  system: System,
  config: HttpConfig,
  readiness?: () => Promise<boolean>,
): Server {
  const http = createHttpServer(system, {
    logger: createLoggerOptions(config.environment),
    signingSecret: config.signingSecret,
    readiness,
  });

  return Object.freeze({
    logger: http.log,
    async start(): Promise<void> {
      await http.listen({
        host: config.host,
        port: config.port,
      });
    },
    async close(): Promise<void> {
      await http.close();
    },
  });
}
