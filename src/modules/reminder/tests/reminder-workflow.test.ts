import { describe, expect, it } from 'vitest';
import { TestNotificationAdapter } from '../../../adapters/notification/test.js';
import { createTestSystem } from '../../../system/tests/support.js';
import type { InterpretationRequest } from '../../interpretation/services/request.js';

describe('reminder workflow', () => {
  it('keeps a deadline range separate from repeated occurrences and delivers end to end', async () => {
    const notifications = new TestNotificationAdapter();
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      notification: notifications,
    });
    const entryId = await entry(system, 'Recuérdame terminar el informe antes de fin de mes.');
    const past = new Date(Date.now() - 60_000).toISOString();
    const second = new Date(Date.now() - 30_000).toISOString();
    const temporal = { from: '2026-08-25T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' };
    const id = await system.reminder.manage.create({
      entryId,
      subject: 'Terminar informe',
      message: 'Termina el informe',
      temporal,
      occurrences: [past, second],
    });

    expect(await system.reminder.manage.read(id)).toMatchObject({
      sourceEntryId: entryId,
      temporal,
      occurrences: [past, second],
    });
    expect(await system.reminder.worker.runDue()).toBe(2);
    expect(notifications.deliveries).toHaveLength(2);
    const intents = await system.execution.store.listIntents();
    expect(
      (await system.execution.store.listAttempts(requireDefined(intents[0]).id))[0]?.outcome,
    ).toBe('succeeded');
    expect(
      (await system.execution.store.listEvents()).filter(
        (event) => event.key === 'notificationDelivered',
      ),
    ).toHaveLength(2);
    expect(await system.state.listView.execute('current')).toHaveLength(2);
    expect((await system.reminder.manage.read(id)).status).toBe('completed');
    await system.close();
  });

  it('stops stale and cancelled reminders without interruptive scheduling controls', async () => {
    const notifications = new TestNotificationAdapter();
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      notification: notifications,
    });
    const entryId = await entry(system, 'Recordatorios controlados.');
    const evidence = [{ entryId, sourceLocators: [] }];
    const taskId = await system.planning.commands.create({
      profile: 'task',
      title: 'Ya hecho',
      evidence,
    });
    const past = new Date(Date.now() - 60_000).toISOString();
    const staleId = await system.reminder.manage.create({
      entryId,
      subjectItemId: taskId,
      message: 'Hazlo',
      occurrences: [past],
    });
    await system.planning.commands.transition(taskId, 'completed', evidence);
    expect(await system.reminder.worker.runDue()).toBe(0);
    expect(notifications.deliveries).toEqual([]);
    const staleAutomation = requireDefined((await system.automation.store.list())[0]);
    expect(
      (await system.automation.store.listResults(staleAutomation.automation.id))[0],
    ).toMatchObject({
      outcome: 'stopped',
      reason: 'Stopping condition is true',
    });
    expect((await system.reminder.manage.read(staleId)).status).toBe('completed');

    const cancelledId = await system.reminder.manage.create({
      entryId,
      subject: 'Cancelar',
      message: 'No enviar',
      occurrences: [past],
    });
    await system.reminder.manage.cancel(cancelledId);
    expect(await system.reminder.worker.runDue()).toBe(0);
    await system.close();
  });

  it('preserves failure and unavailable outcomes without delivered State', async () => {
    for (const mode of ['failed', 'unavailable'] as const) {
      const system = createTestSystem({
        adapter: new EmptyInterpreter(),
        notification: new TestNotificationAdapter(mode),
      });
      const entryId = await entry(system, `Provider ${mode}`);
      await system.reminder.manage.create({
        entryId,
        subject: 'Probar',
        message: 'Entrega',
        occurrences: [new Date(Date.now() - 1_000).toISOString()],
      });
      expect(await system.reminder.worker.runDue()).toBe(1);
      const intent = requireDefined((await system.execution.store.listIntents())[0]);
      expect(
        (await system.execution.store.listAttempts(intent.id)).map((attempt) => attempt.outcome),
      ).toEqual(mode === 'failed' ? ['failed'] : []);
      expect(await system.state.listView.execute('current')).toEqual([]);
      expect(
        (await system.execution.store.listEvents(intent.id)).some(
          (event) => event.key === (mode === 'failed' ? 'attemptFailed' : 'capabilityUnsupported'),
        ),
      ).toBe(true);
      await system.close();
    }
  });

  it('retries uncertainty idempotently and supports rescheduling and authorization', async () => {
    const notifications = new TestNotificationAdapter('uncertain');
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      notification: notifications,
    });
    const entryId = await entry(system, 'Reintenta sin duplicar.');
    const past = new Date(Date.now() - 1_000).toISOString();
    const id = await system.reminder.manage.create({
      entryId,
      subject: 'Reintento',
      message: 'Una sola vez',
      occurrences: [new Date(Date.now() + 60_000).toISOString()],
    });
    await system.reminder.manage.reschedule(id, { occurrences: [past] });
    expect(await system.reminder.worker.runDue()).toBe(1);
    const intent = requireDefined((await system.execution.store.listIntents())[0]);
    expect(
      (await system.execution.store.listAttempts(intent.id)).map((attempt) => attempt.outcome),
    ).toEqual(['uncertain']);
    expect(await system.reminder.worker.execute(intent.id)).toBe('succeeded');
    expect(notifications.deliveries).toHaveLength(1);
    expect(
      new Set(
        (await system.execution.store.listAttempts(intent.id)).map(
          (attempt) => attempt.idempotencyKey,
        ),
      ).size,
    ).toBe(1);

    const authorizationId = await system.reminder.manage.create({
      entryId,
      subject: 'Autorizar',
      message: 'Confirma',
      occurrences: [past],
      authorized: false,
    });
    await system.reminder.worker.runDue();
    const authorizationIntent = requireDefined(
      (await system.execution.store.listIntents()).find(
        (candidate) => (candidate.input as { reminderId?: string }).reminderId === authorizationId,
      ),
    );
    expect(await system.execution.store.listAttempts(authorizationIntent.id)).toEqual([]);
    await system.execution.authorizeIntent.execute(authorizationIntent.id);
    expect(await system.reminder.worker.execute(authorizationIntent.id)).toBe('uncertain');
    expect(await system.reminder.worker.execute(authorizationIntent.id)).toBe('succeeded');
    await system.close();
  });
});

async function entry(system: ReturnType<typeof createTestSystem>, text: string): Promise<string> {
  return system.capture.captureEntry.execute({
    content: { kind: 'text', text },
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
