import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../core/knowledge/entry.js';
import { createAccessToken } from '../auth.js';
import { createHttpServer } from '../server.js';
import { authorization, createTestSystem, signingSecret } from './support.js';

interface EntryPage {
  readonly items: readonly Entry[];
  readonly nextCursor: string | null;
}

describe('capture Entry through HTTP', () => {
  it('captures idempotently and reads Entries with an opaque cursor', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, { signingSecret });
    const payload = {
      content: { kind: 'text', text: 'Keep the original information.' },
      externalId: 'minima-entry-1',
    };
    const first = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: authorization,
      payload,
    });
    const repeated = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: authorization,
      payload,
    });
    const conflicting = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: authorization,
      payload: {
        ...payload,
        content: { kind: 'text', text: 'Different information.' },
      },
    });
    const minimaToken = await createAccessToken('minima', signingSecret);
    const otherSource = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: {
        authorization: `Bearer ${minimaToken}`,
        'x-mutation-mode': 'write',
      },
      payload: {
        ...payload,
        content: { kind: 'text', text: 'Different information from another source.' },
      },
    });
    const id = first.json<{ id: string }>().id;

    for (let index = 0; index < 50; index += 1) {
      await system.capture.captureEntry.execute({
        content: { kind: 'text', text: `Entry ${index}` },
        origin: { source: 'api' },
      });
    }

    const firstPage = await server.inject({
      method: 'GET',
      url: '/api/entries',
      headers: authorization,
    });
    const firstPageData = firstPage.json<EntryPage>();
    const secondPage = await server.inject({
      method: 'GET',
      url: `/api/entries?cursor=${firstPageData.nextCursor}`,
      headers: authorization,
    });
    const entry = await server.inject({
      method: 'GET',
      url: `/api/entries/${id}`,
      headers: authorization,
    });
    const status = await server.inject({
      method: 'GET',
      url: `/api/entries/${id}/status`,
      headers: authorization,
    });
    const invalidCursor = await server.inject({
      method: 'GET',
      url: '/api/entries?cursor=invalid',
      headers: authorization,
    });
    const wrongResourceCursor = await server.inject({
      method: 'GET',
      url: `/api/reviews?cursor=${firstPageData.nextCursor}`,
      headers: authorization,
    });

    expect(first.statusCode).toBe(202);
    expect(repeated.json<{ id: string }>().id).toBe(id);
    expect(conflicting.statusCode).toBe(409);
    expect(otherSource.statusCode).toBe(202);
    expect(firstPageData.items).toHaveLength(50);
    expect(firstPageData.nextCursor).toEqual(expect.any(String));
    expect(secondPage.json<EntryPage>().items).toHaveLength(2);
    expect(entry.json<Entry>().origin.source).toBe('browser');
    expect(status.json<{ status: string }>().status).toBe('queued');
    expect(invalidCursor.statusCode).toBe(400);
    expect(wrongResourceCursor.statusCode).toBe(400);

    await server.close();
  });

  it('reports malformed JSON as invalid input', async () => {
    const server = createHttpServer(createTestSystem(), { signingSecret });
    const response = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: {
        ...authorization,
        'content-type': 'application/json',
      },
      payload: '{"externalId":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'invalidInput',
      },
    });

    await server.close();
  });
});
