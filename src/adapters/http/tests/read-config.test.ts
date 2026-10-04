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
      host: '0.0.0.0',
      port: 3100,
      signingSecret,
      developmentTokenEndpoint: false,
    });
    expect(() => readHttpConfig({})).toThrow('SERVER_SECRET is required');
  });

  it('uses Railway PORT before the local SERVER_PORT setting', () => {
    expect(
      readHttpConfig({
        PORT: '8080',
        SERVER_PORT: '8080',
        SERVER_SECRET: signingSecret,
      }).port,
    ).toBe(8080);
    expect(
      readHttpConfig({
        PORT: '8080',
        SERVER_PORT: '3100',
        SERVER_SECRET: signingSecret,
      }).port,
    ).toBe(8080);
  });

  it('enables the token endpoint only in development', () => {
    expect(
      readHttpConfig({
        SERVER_SECRET: signingSecret,
        NODE_ENV: 'development',
      }).developmentTokenEndpoint,
    ).toBe(true);
    for (const NODE_ENV of ['production', 'test', undefined]) {
      expect(
        readHttpConfig({ SERVER_SECRET: signingSecret, NODE_ENV }).developmentTokenEndpoint,
      ).toBe(false);
    }
  });
});
