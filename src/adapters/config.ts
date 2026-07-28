import { type MutationMode, mutationModes } from '../system/proposal.js';
import { type HttpConfig, readHttpConfig } from './http/config.js';
import { type InferenceAdapterConfig, readInferenceConfig } from './inference/config.js';
import { type PostgresConfig, readPostgresConfig } from './postgres/config.js';

export interface Config {
  readonly http: HttpConfig;
  readonly inference: InferenceAdapterConfig;
  readonly postgres: PostgresConfig;
  readonly system: {
    readonly mode: MutationMode;
  };
}

/**
 * Builds the complete runtime configuration from one environment source.
 */
export function readConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return Object.freeze({
    http: readHttpConfig(environment),
    inference: readInferenceConfig(environment),
    postgres: readPostgresConfig(environment),
    system: Object.freeze({
      mode: readMode(environment.MUTATION_MODE),
    }),
  });
}

function readMode(value: string | undefined): MutationMode {
  const mode = value?.trim() || 'approval';

  if (!mutationModes.includes(mode as MutationMode)) {
    throw new Error('MUTATION_MODE must be readonly, approval, or write');
  }

  return mode as MutationMode;
}
