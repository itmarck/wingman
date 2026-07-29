import { describe, expect, it } from 'vitest';
import { readInferenceConfig } from '../config.js';

describe('Inference configuration', () => {
  it('resolves OpenAI through its known target and provider key', () => {
    expect(
      readInferenceConfig({
        INFERENCE_TARGET: 'openai.luna',
        INFERENCE_API_KEY_OPENAI: 'openai-secret',
        INFERENCE_API_KEY_GROQ: 'inactive-secret',
      }),
    ).toEqual({
      target: 'openai.luna',
      provider: 'openai',
      model: 'gpt-5.6-luna',
      endpoint: 'https://api.openai.com/v1/responses',
      apiKey: 'openai-secret',
    });
  });

  it('resolves Groq without requiring inactive provider credentials', () => {
    expect(
      readInferenceConfig({
        INFERENCE_TARGET: 'groq.gptoss',
        INFERENCE_API_KEY_GROQ: 'groq-secret',
      }),
    ).toEqual({
      target: 'groq.gptoss',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      endpoint: 'https://api.groq.com/openai/v1/responses',
      apiKey: 'groq-secret',
    });
  });

  it('rejects a missing or unsupported target before startup', () => {
    expect(() => readInferenceConfig({})).toThrow('INFERENCE_TARGET is required');
    expect(() =>
      readInferenceConfig({
        INFERENCE_TARGET: 'groq.unknown',
        INFERENCE_API_KEY_GROQ: 'groq-secret',
      }),
    ).toThrow('Unsupported INFERENCE_TARGET: groq.unknown');
  });

  it('requires credentials only for the selected provider', () => {
    expect(() =>
      readInferenceConfig({
        INFERENCE_TARGET: 'openai.luna',
        INFERENCE_API_KEY_GROQ: 'inactive-secret',
      }),
    ).toThrow('INFERENCE_API_KEY_OPENAI is required');
  });
});
