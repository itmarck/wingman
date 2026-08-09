import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../server.js';
import { authorization, createTestSystem, signingSecret } from './support.js';

describe('launcher notification HTTP API', () => {
  it('lists, reads and acknowledges a derived notification', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, { signingSecret });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Notifica el pago.' },
      origin: { source: 'test' },
    });
    const evidence = [{ entryId, sourceLocators: [] }];
    const subjectItemId = await system.planning.commands.create({
      profile: 'task',
      title: 'Pagar',
      evidence,
    });
    const automationId = 'http-notification';
    await system.automation.registerAutomation.execute({
      id: automationId,
      subjects: [{ kind: 'itemReference', itemId: subjectItemId }],
      given: [],
      when: {
        operator: { key: 'schedule', version: 1 },
        occurrences: [new Date(Date.now() - 1_000).toISOString()],
      },
      thenIntents: [
        {
          capability: { key: 'notification', version: 1 },
          input: {
            automationId,
            occurrenceId: '$trigger.id',
            subjectItemId,
            message: 'Paga',
          },
          conditions: [],
          expectedState: [],
          authorization: 'none',
        },
      ],
      evidence,
    });
    await system.notification.worker.runDue();

    const listed = await server.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: authorization.authorization },
    });
    const [notification] = listed.json<Array<{ id: string; subjectItemId: string }>>();
    const read = await server.inject({
      method: 'GET',
      url: `/api/notifications/${notification?.id}`,
      headers: { authorization: authorization.authorization },
    });
    const acknowledged = await server.inject({
      method: 'POST',
      url: `/api/notifications/${notification?.id}/acknowledgement`,
      headers: authorization,
    });
    const after = await server.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: authorization.authorization },
    });

    expect(listed.statusCode).toBe(200);
    expect(notification).toMatchObject({ subjectItemId });
    expect(read.statusCode).toBe(200);
    expect(acknowledged.statusCode).toBe(204);
    expect(after.json()).toEqual([]);
    expect(await system.planning.queries.list('pending')).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: subjectItemId })]),
    );
    await server.close();
    await system.close();
  });
});
