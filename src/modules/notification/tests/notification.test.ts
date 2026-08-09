import { describe, expect, it } from 'vitest';
import { createTestSystem } from '../../../system/tests/support.js';
import type { InterpretationRequest } from '../../interpretation/services/request.js';

describe('launcher notifications', () => {
  it('derives and compacts delivered notices without a notification entity', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await entry(system);
    const evidence = [{ entryId, sourceLocators: [] }];
    const subjectItemId = await system.planning.commands.create({
      profile: 'task',
      title: 'Terminar informe',
      evidence,
    });
    const first = new Date(Date.now() - 60_000).toISOString();
    const second = new Date(Date.now() - 30_000).toISOString();
    const automationId = await system.automation.registerAutomation.execute({
      id: 'schedule',
      subjects: [{ kind: 'itemReference', itemId: subjectItemId }],
      given: [],
      when: { operator: { key: 'schedule', version: 1 }, occurrences: [first, second] },
      thenIntents: [
        {
          capability: { key: 'notification', version: 1 },
          input: {
            automationId: 'schedule',
            occurrenceId: '$trigger.id',
            subjectItemId,
            message: 'Termina el informe',
          },
          conditions: [],
          expectedState: [],
          authorization: 'none',
        },
      ],
      controls: { priority: 4, deduplication: 'trigger' },
      evidence,
    });

    expect(await system.notification.worker.runDue()).toBe(2);
    const notifications = await system.notification.service.list();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      automationId: 'schedule',
      subjectItemId,
      message: 'Termina el informe',
      priority: 4,
      occurrenceId: second,
      actions: ['acknowledge'],
    });
    expect((await system.automation.store.find(automationId))?.automation.status).toBe('stopped');
    expect(
      (await system.execution.store.listEvents()).filter(
        (event) => event.key === 'notificationDelivered',
      ),
    ).toHaveLength(2);
    await system.close();
  });

  it('acknowledges a notice without completing its subject', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await entry(system);
    const evidence = [{ entryId, sourceLocators: [] }];
    const subjectItemId = await system.planning.commands.create({
      profile: 'task',
      title: 'Pagar',
      evidence,
    });
    const occurrence = new Date(Date.now() - 1_000).toISOString();
    const automationId = 'pay-notification';
    await system.automation.registerAutomation.execute({
      id: automationId,
      subjects: [{ kind: 'itemReference', itemId: subjectItemId }],
      given: [],
      when: { operator: { key: 'schedule', version: 1 }, occurrences: [occurrence] },
      thenIntents: [
        {
          capability: { key: 'notification', version: 1 },
          input: { automationId, occurrenceId: '$trigger.id', subjectItemId, message: 'Paga' },
          conditions: [],
          expectedState: [],
          authorization: 'none',
        },
      ],
      evidence,
    });
    await system.notification.worker.runDue();
    const notification = requireDefined((await system.notification.service.list())[0]);

    await system.notification.service.acknowledge(notification.id);

    expect(await system.notification.service.list()).toEqual([]);
    expect(
      (await system.execution.store.listEvents(notification.id)).map((event) => event.key),
    ).toContain('notificationAcknowledged');
    expect(await system.planning.queries.list('pending')).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: subjectItemId })]),
    );
    await system.close();
  });
});

async function entry(system: ReturnType<typeof createTestSystem>): Promise<string> {
  return system.capture.captureEntry.execute({
    content: { kind: 'text', text: 'Crea una notificación.' },
    origin: { source: 'test' },
  });
}

class EmptyInterpreter {
  readonly identity = Object.freeze({ key: 'empty' });
  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge' as const,
      draft: { entryId: request.entry.id, items: [], components: [] },
    };
  }
}

function requireDefined<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error('Expected test value');
  return value;
}
