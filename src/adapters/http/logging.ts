import type { FastifyServerOptions } from 'fastify';

export type RuntimeEnvironment = 'development' | 'production' | 'test';

/**
 * Creates readable development logs while preserving structured production output.
 */
export function createLoggerOptions(
  environment: RuntimeEnvironment,
): FastifyServerOptions['logger'] {
  if (environment === 'test') {
    return false;
  }

  const base = {
    level: 'info',
    redact: ['req.headers.authorization'],
  };

  if (environment === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss',
        },
      },
    };
  }

  return base;
}
