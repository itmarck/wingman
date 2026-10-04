export interface HttpConfig {
  readonly host: string;
  readonly port: number;
  readonly signingSecret: string;
  readonly developmentTokenEndpoint: boolean;
}

/**
 * Reads and validates the minimal configuration required by the HTTP server.
 */
export function readHttpConfig(environment: NodeJS.ProcessEnv = process.env): HttpConfig {
  const signingSecret = environment.SERVER_SECRET?.trim();
  const port = Number(environment.PORT ?? environment.SERVER_PORT ?? 3000);
  if (!signingSecret) {
    throw new Error('SERVER_SECRET is required');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT or SERVER_PORT must be a valid TCP port');
  }

  return Object.freeze({
    host: '0.0.0.0',
    port,
    signingSecret,
    developmentTokenEndpoint: environment.NODE_ENV === 'development',
  });
}
