import { type HttpConfig, readHttpConfig } from './http/config.js';
import { type InferenceAdapterConfig, readInferenceConfig } from './inference/config.js';
import { type PostgresConfig, readPostgresConfig } from './postgres/config.js';

export interface Config {
  readonly http: HttpConfig;
  readonly inference: InferenceAdapterConfig;
  readonly postgres: PostgresConfig;
}

/**
 * Builds the complete runtime configuration from one environment source.
 */
export function readConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return Object.freeze({
    http: readHttpConfig(environment),
    inference: readInferenceConfig(environment),
    postgres: readPostgresConfig(environment),
  });
}
