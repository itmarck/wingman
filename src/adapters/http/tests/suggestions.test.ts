import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../server.js';
import { authorization, createTestSystem, signingSecret } from './support.js';

describe('Suggestion HTTP API', () => {
  it('lists, reads and records feedback using only Suggestion resource routes', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, { signingSecret });
    try {
      const entryId = await system.capture.captureEntry.execute({
        content: { kind: 'text', text: 'Quiero completar este objetivo.' },
        origin: { source: 'test' },
      });
      await system.planning.commands.create({
        profile: 'objective',
        title: 'Completar objetivo',
        evidence: [{ entryId, sourceLocators: [] }],
      });
      const [suggestion] = await system.suggestion.service.evaluate({ kind: 'scan' });

      const listed = await server.inject({
        method: 'GET',
        url: '/api/suggestions',
        headers: { authorization: authorization.authorization },
      });
      const read = await server.inject({
        method: 'GET',
        url: `/api/suggestions/${suggestion?.id}`,
        headers: { authorization: authorization.authorization },
      });
      const feedback = await server.inject({
        method: 'POST',
        url: `/api/suggestions/${suggestion?.id}/feedback`,
        headers: authorization,
        payload: { kind: 'rejected' },
      });
      const legacy = await server.inject({
        method: 'GET',
        url: '/api/proactive-proposals',
        headers: { authorization: authorization.authorization },
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: suggestion?.id })]),
      );
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ id: suggestion?.id });
      expect(feedback.statusCode).toBe(204);
      expect(await system.suggestion.service.read(suggestion?.id ?? '')).toMatchObject({
        status: 'rejected',
        feedback: [expect.objectContaining({ kind: 'rejected' })],
      });
      expect(legacy.statusCode).toBe(404);
    } finally {
      await server.close();
      await system.close();
    }
  });
});
