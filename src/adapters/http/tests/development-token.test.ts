import { describe, expect, it } from 'vitest';
import { readHttpConfig } from '../config.js';
import { createHttpServer } from '../server.js';
import { createTestSystem, signingSecret } from './support.js';

describe('development access token endpoint', () => {
  it('does not register the token endpoint outside development', async () => {
    for (const NODE_ENV of ['production', 'test', undefined]) {
      const server = createHttpServer(
        createTestSystem(),
        readHttpConfig({ SERVER_SECRET: signingSecret, NODE_ENV }),
      );
      const response = await server.inject({ method: 'POST', url: '/api/token' });

      expect(response.statusCode).toBe(404);
      await server.close();
    }
  });

  it('creates a token that can access the protected API when enabled', async () => {
    const server = createHttpServer(
      createTestSystem(),
      readHttpConfig({ SERVER_SECRET: signingSecret, NODE_ENV: 'development' }),
    );
    const tokenResponse = await server.inject({
      method: 'POST',
      url: '/api/token?source=codex',
    });
    const token = tokenResponse.json<{ token: string }>().token;
    const apiResponse = await server.inject({
      method: 'GET',
      url: '/api/entries',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(tokenResponse.statusCode).toBe(200);
    expect(apiResponse.statusCode).toBe(200);
    expect(apiResponse.json()).toMatchObject({ items: [] });

    await server.close();
  });
});
