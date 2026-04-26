import { describe, it, expect, beforeEach } from 'vitest';
import { getProvider, _resetProvider } from '../shared/ai/index.js';

beforeEach(() => {
  _resetProvider();
});

describe('AI dispatcher', () => {
  it('default provider is local (Ollama)', () => {
    delete process.env.AI_PROVIDER;
    expect(getProvider().name).toBe('local');
  });

  it('selects groq when AI_PROVIDER=groq', () => {
    process.env.AI_PROVIDER = 'groq';
    expect(getProvider().name).toBe('groq');
  });

  it('selects claude when AI_PROVIDER=claude', () => {
    process.env.AI_PROVIDER = 'claude';
    expect(getProvider().name).toBe('claude');
  });

  it('falls back to local on unknown provider name', () => {
    process.env.AI_PROVIDER = 'nonsense';
    expect(getProvider().name).toBe('local');
  });
});
