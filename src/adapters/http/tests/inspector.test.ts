import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../server.js';
import { createTestSystem, signingSecret } from './support.js';

describe('development inspector', () => {
  it('serves the dark document and a connected read-only snapshot outside production', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, {
      signingSecret,
      environment: { NODE_ENV: 'development' },
    });
    try {
      const entryId = await system.capture.captureEntry.execute({
        content: { kind: 'text', text: 'Tengo que revisar el inspector.' },
        origin: { source: 'test' },
      });
      await system.interpretation.processNext.execute();
      await system.planning.commands.create({
        profile: 'task',
        title: 'Revisar el inspector',
        evidence: [{ entryId, sourceLocators: [] }],
      });
      await system.planning.commands.create({
        profile: 'objective',
        title: 'Entender Wingman',
        evidence: [{ entryId, sourceLocators: [] }],
      });
      await system.suggestion.service.evaluate({ kind: 'scan' });
      const [page, data] = await Promise.all([
        server.inject({ method: 'GET', url: '/inspect' }),
        server.inject({ method: 'GET', url: '/inspect/data' }),
      ]);
      const snapshot = data.json<{
        nodes: readonly { id: string; type: string }[];
        edges: readonly { from: string; to: string; type: string }[];
      }>();
      const entry = snapshot.nodes.find((node) => node.type === 'entry');
      const interpretation = snapshot.nodes.find((node) => node.type === 'interpretation');

      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.body).toContain('Wingman Inspector');
      expect(page.body).toContain('--background: #09090b');
      expect(page.body).toContain('<json-viewer id="detail-json">');
      expect(page.body).toContain(
        'https://cdn.jsdelivr.net/npm/@alenaksu/json-viewer@2.1.2/dist/json-viewer.bundle.js',
      );
      expect(page.body).toContain(
        'integrity="sha384-WXI6N5Prus47Xp40Trnkq6kVftC+HZ0t+cb69l3oh0DReb5XnzMHU6caMho+S/LI"',
      );
      expect(page.body).toContain('crossorigin="anonymous"');
      expect(page.body).toContain('referrerpolicy="no-referrer"');
      expect(page.headers['content-security-policy']).toContain('https://cdn.jsdelivr.net');
      expect(page.headers['referrer-policy']).toBe('no-referrer');
      expect(page.headers['x-content-type-options']).toBe('nosniff');
      expect(data.statusCode).toBe(200);
      expect(snapshot.nodes.map((node) => node.type)).toEqual(
        expect.arrayContaining(['entry', 'interpretation', 'item', 'component', 'suggestion']),
      );
      expect(snapshot.edges).toContainEqual({
        from: entry?.id,
        to: interpretation?.id,
        type: 'interpretedAs',
      });
    } finally {
      await server.close();
      await system.close();
    }
  });

  it('does not register either route in production', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, {
      signingSecret,
      environment: { NODE_ENV: 'production' },
    });
    try {
      const [page, data] = await Promise.all([
        server.inject({ method: 'GET', url: '/inspect' }),
        server.inject({ method: 'GET', url: '/inspect/data' }),
      ]);
      expect(page.statusCode).toBe(404);
      expect(data.statusCode).toBe(404);
    } finally {
      await server.close();
      await system.close();
    }
  });
});
