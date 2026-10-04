import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../server.js';
import { authorization, createTestSystem, signingSecret } from './support.js';

describe('authenticated HTTP writes', () => {
  it('captures an Entry directly after authentication', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, { signingSecret });
    const response = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: { authorization: authorization.authorization },
      payload: {
        content: { kind: 'text', text: 'Authenticated writes are applied directly.' },
        externalId: 'direct-write',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'queued' });

    await server.close();
  });
});
