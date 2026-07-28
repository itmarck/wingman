import { describe, expect, it } from 'vitest';
import { readHttpConfig } from '../config.js';
import { signingSecret } from './support.js';

describe('read HTTP configuration', () => {
  it('reads required environment values and rejects a missing signing secret', () => {
    expect(
      readHttpConfig({
        SERVER_PORT: '3100',
        SERVER_SECRET: signingSecret,
      }),
    ).toEqual({
      environment: 'development',
      host: '0.0.0.0',
      port: 3100,
      signingSecret,
    });
    expect(() => readHttpConfig({})).toThrow('SERVER_SECRET is required');
  });

  it('reads the port assigned by the deployment platform', () => {
    expect(
      readHttpConfig({
        SERVER_PORT: '8080',
        SERVER_SECRET: signingSecret,
      }).port,
    ).toBe(8080);
  });
});
