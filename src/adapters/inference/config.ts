import type { InferenceConfig } from '../../modules/interpretation/services/interpreter.js';
import { type InferenceProvider, resolveInferenceTarget } from './target.js';

export interface InferenceAdapterConfig extends InferenceConfig {
  readonly apiKey: string;
}

/**
 * Resolves the required deployment target and credentials for its provider.
 */
export function readInferenceConfig(environment = process.env): InferenceAdapterConfig {
  const target = resolveInferenceTarget(
    requireValue(environment.INFERENCE_TARGET, 'INFERENCE_TARGET'),
  );
  const apiKeyName = apiKeyNames[target.provider];

  return Object.freeze({
    target: target.key,
    provider: target.provider,
    model: target.model,
    apiKey: requireValue(environment[apiKeyName], apiKeyName),
  });
}

const apiKeyNames: Readonly<Record<InferenceProvider, string>> = Object.freeze({
  openai: 'INFERENCE_API_KEY_OPENAI',
  groq: 'INFERENCE_API_KEY_GROQ',
});

function requireValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required`);
  }

  return normalized;
}
