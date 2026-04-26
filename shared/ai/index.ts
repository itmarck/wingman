import { createLogger } from '../logger.js';
import type { AIOptions, AIProvider, ClassificationResult, RawResult } from './types.js';
import { ClaudeProvider } from './providers/claude.js';
import { LocalProvider } from './providers/local.js';
import { GroqProvider } from './providers/groq.js';

const log = createLogger('clde');

export type ProviderName = 'local' | 'groq' | 'claude';

let cached: AIProvider | null = null;

function selectProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER || 'local').toLowerCase() as ProviderName;
  switch (name) {
    case 'local':
      return new LocalProvider();
    case 'groq':
      return new GroqProvider();
    case 'claude':
      return new ClaudeProvider();
    default:
      log.warn(`Unknown AI_PROVIDER="${name}", falling back to local`);
      return new LocalProvider();
  }
}

export function getProvider(): AIProvider {
  if (!cached) {
    cached = selectProvider();
    log.verb(`AI provider initialized: ${cached.name}`);
  }
  return cached;
}

/** Test-only: reset the cached provider so a new env value takes effect. */
export function _resetProvider(): void {
  cached = null;
}

// Backwards-compatible function exports — agents keep importing these names.
export function classify(prompt: string, options?: AIOptions): Promise<ClassificationResult> {
  return getProvider().classify(prompt, options);
}

export function classifyRaw(prompt: string, options?: AIOptions): Promise<RawResult> {
  return getProvider().classifyRaw(prompt, options);
}

export function summarize(prompt: string, options?: AIOptions): Promise<string> {
  return getProvider().summarize(prompt, options);
}

export type { AIProvider, AIOptions, ClassificationResult, RawResult } from './types.js';
