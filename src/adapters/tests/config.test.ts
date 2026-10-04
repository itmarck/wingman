import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';

const requiredEnvironment = {
  SERVER_SECRET: 'secret',
  DATABASE_URL: 'postgresql://localhost/wingman',
  INFERENCE_TARGET: 'openai.luna',
  INFERENCE_API_KEY_OPENAI: 'openai-secret',
};

describe('Runtime configuration', () => {
  it('organizes infrastructure configuration from one environment', () => {
    expect(
      readConfig({
        ...requiredEnvironment,
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
        endpoint: 'https://api.openai.com/v1/responses',
        apiKey: 'openai-secret',
      },
      postgres: {
        connectionString: 'postgresql://localhost/wingman',
      },
    });
  });

  it('uses the inference configuration required by the runtime', () => {
    expect(readConfig(requiredEnvironment)).toMatchObject({
      inference: {
        target: 'openai.luna',
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
