import { describe, expect, it } from 'vitest';
import { alterToken, createTestServer, token } from './support.js';

describe('authenticate HTTP request', () => {
  it('protects the API while leaving health available', async () => {
    const server = createTestServer();
    const health = await server.inject({ method: 'GET', url: '/api/health' });
    const unauthorized = await server.inject({ method: 'GET', url: '/api/entries' });
    const altered = await server.inject({
      method: 'GET',
      url: '/api/entries',
      headers: { authorization: `Bearer ${alterToken(token)}` },
    });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(unauthorized.statusCode).toBe(401);
    expect(altered.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'A valid bearer token is required',
      },
    });

    await server.close();
  });
});
