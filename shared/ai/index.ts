import { createLogger } from '../logger.js';
import type { AIOptions, AIProvider, ClassificationResult, RawResult } from './types.js';
import { ClaudeProvider } from './providers/claude.js';
import { MockProvider } from './providers/mock.js';

const log = createLogger('clde');

export type ProviderName = 'claude' | 'mock' | 'ollama' | 'groq' | 'gemini';

let cached: AIProvider | null = null;

function selectProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER || 'claude').toLowerCase() as ProviderName;
  switch (name) {
    case 'claude':
      return new ClaudeProvider();
    case 'mock':
      return new MockProvider();
    // case 'ollama' | 'groq' | 'gemini' wired in once the remote choice is final
    default:
      log.warn(`Unknown AI_PROVIDER="${name}", falling back to claude`);
      return new ClaudeProvider();
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
