import { describe, expect, it } from 'vitest';
import { createTestServer } from './support.js';

describe('read OpenAPI document', () => {
  it('exposes the current authenticated API without authentication', async () => {
    const server = createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/openapi.json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      openapi: string;
      security: unknown;
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        Record<
          string,
          {
            security?: unknown;
            parameters?: unknown[];
            responses?: Record<string, unknown>;
            requestBody?: {
              content: Record<string, { example?: unknown }>;
            };
          }
        >
      >;
    }>();

    expect(document.openapi).toBe('3.0.3');
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    expect(document.servers[0]?.url).toMatch(/^http:\/\//);
    expect(document.paths['/api/health']?.get?.security).toEqual([]);
    expect(document.paths['/api/openapi.json']?.get?.security).toEqual([]);
    expect(document.paths['/api/entries']?.get?.security).toBeUndefined();
    expect(document.paths['/api/entries']?.post?.parameters ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'header',
          name: 'x-mutation-mode',
        }),
      ]),
    );
    expect(document.paths['/api/entries']?.get?.responses).toHaveProperty('401');
    expect(
      document.paths['/api/entries']?.post?.requestBody?.content['application/json']?.example,
    ).toEqual({
      externalId: '<<$guid>>',
      content: {
        kind: 'text',
        text: 'Wingman preserves knowledge from captured entries.',
      },
    });
    expect(
      document.paths['/api/reviews/{id}/resolution']?.post?.requestBody?.content['application/json']
        ?.example,
    ).toEqual({
      decision: {
        reference: 'reference-from-review',
        selectedConceptId: '<<conceptId>>',
      },
    });

    await server.close();
  });
});
