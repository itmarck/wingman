import { describe, expect, it } from 'vitest';
import { MemoryWorkflowRegistry } from '../../modules/interpretation/adapters/memory/workflow.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import { EntryWorkflowRouter } from '../workflow.js';
import { createTestSystem } from './support.js';

describe('interpreted Entry workflows', () => {
  it('creates an evidence-backed task and leaves an unresolved reminder non-executable', async () => {
    const system = createTestSystem({ adapter: new WorkflowInterpreter() });
    const entryId = await system.capture.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Recuérdame anular la tarjeta de crédito {bankName} antes de fin de mes',
      },
      origin: { source: 'test' },
    });
    expect(await system.interpretation.processNext.execute()).toBe(true);
    const status = await system.interpretation.getEntryStatus.execute(entryId);
    expect(status.status).toBe('completed');
    expect(status.workflowStatus).toBe('needsInput');
    expect(status.workflows.map((outcome) => outcome.status)).toEqual(['applied', 'needsInput']);
    expect(await system.planning.queries.list('pending')).toEqual([
      expect.objectContaining({
        title: 'Anular la tarjeta de crédito {bankName}',
        unresolved: ['{bankName}'],
      }),
    ]);
    expect(await system.reminder.manage.list()).toEqual([]);
    expect(await system.rule.store.list()).toEqual([]);
    expect(await system.execution.store.listIntents()).toEqual([]);
    await system.close();
  });

  it('applies a complete reminder without executing its Intent', async () => {
    const system = createTestSystem({ adapter: new CompleteWorkflowInterpreter() });
    const first = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Recuérdame pagar mañana' },
      origin: { source: 'test' },
    });
    expect(await system.interpretation.processNext.execute()).toBe(true);
    expect(
      (await system.interpretation.getEntryStatus.execute(first)).workflows.map(
        (value) => value.status,
      ),
    ).toEqual(['applied', 'applied']);
    expect(await system.reminder.manage.list()).toHaveLength(1);
    expect(await system.rule.store.list()).toHaveLength(1);
    expect(await system.execution.store.listIntents()).toEqual([]);

    const draft = (await system.interpretation.getEntryStatus.execute(first)).workflows;
    await system.workflow.list(first);
    expect(draft).toHaveLength(2);
    await system.close();
  });

  it('deduplicates applied drafts and records unsupported Event sources', async () => {
    const outcomes = new MemoryWorkflowRegistry();
    let planningCalls = 0;
    let reminderCalls = 0;
    const router = new EntryWorkflowRouter(
      outcomes,
      { create: async () => `task-${++planningCalls}` },
      { create: async () => `reminder-${++reminderCalls}` },
      { now: () => new Date('2026-08-02T12:00:00.000Z') },
    );
    const complete = {
      entryId: 'entry-idempotent',
      items: [],
      components: [],
      workflows: [
        {
          kind: 'planningRequest' as const,
          version: 1 as const,
          reference: 'task',
          profile: 'task' as const,
          title: 'Pagar',
          unresolved: [],
        },
        {
          kind: 'reminderRequest' as const,
          version: 1 as const,
          reference: 'reminder',
          subjectReference: 'task',
          message: 'Paga',
          schedule: { kind: 'occurrences' as const, at: ['2026-08-03T12:00:00.000Z'] },
          unresolved: [],
        },
      ],
    };
    await router.execute(complete);
    await router.execute(complete);
    expect({ planningCalls, reminderCalls }).toEqual({ planningCalls: 1, reminderCalls: 1 });

    await router.execute({
      entryId: 'entry-event',
      items: [],
      components: [],
      workflows: [
        {
          kind: 'planningRequest',
          version: 1,
          reference: 'subject',
          profile: 'task',
          title: 'Correo',
          unresolved: [],
        },
        {
          kind: 'reminderRequest',
          version: 1,
          reference: 'eventReminder',
          subjectReference: 'subject',
          message: 'Correo recibido',
          schedule: { kind: 'event', eventKey: 'emailReceived' },
          unresolved: [],
        },
      ],
    });
    expect((await outcomes.list('entry-event')).map((outcome) => outcome.status)).toEqual([
      'applied',
      'unsupported',
    ]);
    expect(reminderCalls).toBe(1);
  });
});

class WorkflowInterpreter {
  readonly identity = Object.freeze({ key: 'workflow' });
  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        items: [],
        components: [],
        workflows: [
          {
            kind: 'planningRequest' as const,
            version: 1 as const,
            reference: 'task',
            profile: 'task' as const,
            title: 'Anular la tarjeta de crédito {bankName}',
            temporal: { to: '2026-08-31T23:59:59.000Z', precision: 'month' as const },
            unresolved: ['{bankName}'],
          },
          {
            kind: 'reminderRequest' as const,
            version: 1 as const,
            reference: 'reminder',
            subjectReference: 'task',
            message: 'Anula la tarjeta',
            temporal: { to: '2026-08-31T23:59:59.000Z', precision: 'month' as const },
            schedule: { kind: 'deadlineOffsets' as const, offsetsBeforeMs: [86_400_000] },
            unresolved: [],
          },
        ],
      },
    };
  }
}

class CompleteWorkflowInterpreter {
  readonly identity = Object.freeze({ key: 'completeWorkflow' });
  async interpret(request: InterpretationRequest) {
    const to = new Date(Date.now() + 86_400_000).toISOString();
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        items: [],
        components: [],
        workflows: [
          {
            kind: 'planningRequest' as const,
            version: 1 as const,
            reference: 'task',
            profile: 'task' as const,
            title: 'Pagar',
            temporal: { to, precision: 'day' as const },
            unresolved: [],
          },
          {
            kind: 'reminderRequest' as const,
            version: 1 as const,
            reference: 'reminder',
            subjectReference: 'task',
            message: 'Paga',
            temporal: { to, precision: 'day' as const },
            schedule: { kind: 'deadlineOffsets' as const, offsetsBeforeMs: [3_600_000] },
            unresolved: [],
          },
        ],
      },
    };
  }
}
