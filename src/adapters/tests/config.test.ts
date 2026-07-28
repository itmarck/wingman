import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';

const requiredEnvironment = {
  SERVER_SECRET: 'secret',
  DATABASE_URL: 'postgresql://localhost/wingman',
  INFERENCE_TARGET: 'openai.luna',
  INFERENCE_API_KEY_OPENAI: 'openai-secret',
};

describe('Runtime configuration', () => {
  it('organizes adapter and system configuration from one environment', () => {
    expect(
      readConfig({
        ...requiredEnvironment,
        MUTATION_MODE: 'write',
        SERVER_PORT: '3100',
      }),
    ).toMatchObject({
      http: {
        port: 3100,
      },
      inference: {
        target: 'openai.luna',
        provider: 'openai',
        model: 'gpt-5.6-luna',
        apiKey: 'openai-secret',
      },
      postgres: {
        connectionString: 'postgresql://localhost/wingman',
      },
      system: {
        mode: 'write',
      },
    });
  });

  it('uses safe system defaults without making inference optional', () => {
    expect(readConfig(requiredEnvironment)).toMatchObject({
      inference: {
        target: 'openai.luna',
      },
      system: {
        mode: 'approval',
      },
    });
  });

  it('rejects runtime configuration without an inference target', () => {
    expect(() =>
      readConfig({
        SERVER_SECRET: 'secret',
        DATABASE_URL: 'postgresql://localhost/wingman',
      }),
    ).toThrow('INFERENCE_TARGET is required');
  });
});
