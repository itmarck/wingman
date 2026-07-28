import type { RuntimeEnvironment } from './logging.js';

export interface HttpConfig {
  readonly environment: RuntimeEnvironment;
  readonly host: string;
  readonly port: number;
  readonly signingSecret: string;
}

/**
 * Reads and validates the minimal configuration required by the HTTP server.
 */
export function readHttpConfig(environment: NodeJS.ProcessEnv = process.env): HttpConfig {
  const runtimeEnvironment = environment.NODE_ENV ?? 'development';
  const signingSecret = environment.SERVER_SECRET?.trim();
  const port = Number(environment.SERVER_PORT ?? 3000);
  const environments = ['development', 'production', 'test'];

  if (!environments.includes(runtimeEnvironment)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  if (!signingSecret) {
    throw new Error('SERVER_SECRET is required');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SERVER_PORT must be a valid TCP port');
  }

  return Object.freeze({
    environment: runtimeEnvironment as RuntimeEnvironment,
    host: '0.0.0.0',
    port,
    signingSecret,
  });
}
