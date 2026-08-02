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
    const glossary = await server.inject({
      method: 'GET',
      url: '/api/projections/system.glossary',
      headers: authorization,
    });
    const predicates = await server.inject({
      method: 'GET',
      url: '/api/projections/system.predicates',
      headers: authorization,
    });

    expect(projections.json<Array<{ key: string }>>()).toEqual([
      expect.objectContaining({ key: 'system.currentAxioms' }),
      expect.objectContaining({ key: 'system.glossary' }),
      expect.objectContaining({ key: 'system.predicates' }),
    ]);
    expect(currentAxioms.statusCode).toBe(200);
    expect(glossary.json()).toMatchObject({
      data: {
        concepts: [],
      },
    });
    expect(
      predicates.json<{ data: { predicates: unknown[] } }>().data.predicates.length,
    ).toBeGreaterThan(0);

    await server.close();
  });
});
