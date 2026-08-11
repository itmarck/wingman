import { describe, expect, it } from 'vitest';
import { createTestServer } from './support.js';

describe('read readiness', () => {
  it('keeps liveness healthy while reporting database unavailability', async () => {
    const server = createTestServer(async () => false);

    const health = await server.inject({ method: 'GET', url: '/api/health' });
    const readiness = await server.inject({ method: 'GET', url: '/api/ready' });

    expect(health.statusCode).toBe(200);
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({ status: 'unavailable' });
    await server.close();
  });
});
