import { describe, expect, it } from 'vitest';
import { authorization, createTestServer } from './support.js';

describe('read Projection through HTTP', () => {
  it('discovers and reads system Projections', async () => {
    const server = createTestServer();
    const projections = await server.inject({
      method: 'GET',
      url: '/api/projections',
      headers: authorization,
    });
    const currentAxioms = await server.inject({
      method: 'GET',
      url: '/api/projections/system.currentAxioms',
      headers: authorization,
    });

    expect(projections.json<Array<{ key: string }>>()).toEqual([
      expect.objectContaining({ key: 'system.currentAxioms' }),
    ]);
    expect(currentAxioms.statusCode).toBe(200);

    await server.close();
  });
});
