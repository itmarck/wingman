import { describe, expect, it } from 'vitest';
import { createTestSystem } from '../../../system/tests/support.js';
import type { InterpretationRequest } from '../../interpretation/services/request.js';

describe('planning', () => {
  it('composes appointments, objectives, plans and habits without inventing schedules', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Quiero aprender japonés y llamar para agendar una cita.' },
      origin: { source: 'test' },
    });
    const evidence = [{ entryId, sourceLocators: [] }];
    const objectiveId = await system.planning.commands.create({
      profile: 'objective',
      title: 'Aprender japonés',
      progress: { current: 2, target: 10, unit: 'lecciones' },
      evidence,
    });
    const planId = await system.planning.commands.create({
      profile: 'plan',
      title: 'Plan de estudio',
      objectiveId,
      evidence,
    });
    const habitId = await system.planning.commands.create({
      profile: 'habit',
      title: 'Practicar a diario',
      objectiveId,
      planId,
      recurrence: 'daily',
      evidence,
    });
    const callId = await system.planning.commands.create({
      profile: 'task',
      title: 'Llamar para agendar una cita',
      objectiveId,
      planId,
      evidence,
    });

    expect(
      (await system.planning.queries.list('unscheduled')).map((item) => item.itemId),
    ).toContain(callId);
    expect(
      (await system.planning.queries.list('progress')).find((item) => item.itemId === objectiveId),
    ).toMatchObject({ progress: 0.2, hasActionableNextStep: true });
    expect((await system.planning.queries.list('pending')).map((item) => item.itemId)).toEqual(
      expect.arrayContaining([objectiveId, planId, habitId, callId]),
    );
    expect(await system.state.listView.execute('desired')).toHaveLength(1);
    expect(await system.rule.store.list()).toEqual([]);
    expect(await system.execution.store.listIntents()).toEqual([]);
    await system.close();
  });

  it('identifies blockers, rejects cycles and preserves completion when reopening', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Haz primero A y después B.' },
      origin: { source: 'test' },
    });
    const evidence = [{ entryId, sourceLocators: [] }];
    const first = await system.planning.commands.create({
      profile: 'task',
      title: 'Primero',
      evidence,
    });
    const second = await system.planning.commands.create({
      profile: 'task',
      title: 'Después',
      dependencyIds: [first],
      evidence,
    });

    expect(
      (await system.planning.queries.list('blocked')).find((item) => item.itemId === second)
        ?.blockerIds,
    ).toEqual([first]);
    expect((await system.planning.queries.list('actionable')).map((item) => item.itemId)).toEqual([
      first,
    ]);
    await expect(
      system.planning.commands.relate(first, { dependencyIds: [second] }, evidence),
    ).rejects.toThrow('cycle');
    await system.planning.commands.transition(first, 'completed', evidence);
    expect((await system.planning.queries.list('actionable')).map((item) => item.itemId)).toEqual([
      second,
    ]);
    await system.planning.commands.transition(first, 'pending', evidence);
    expect(
      (await system.planning.queries.history(first)).map((transition) => transition.to),
    ).toEqual(['pending', 'completed', 'pending']);
    await expect(system.planning.commands.transition(first, 'achieved', evidence)).rejects.toThrow(
      'cannot transition',
    );
    await system.close();
  });

  it('validates typed references and exposes overdue work', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Fecha y responsable.' },
      origin: { source: 'test' },
    });
    const evidence = [{ entryId, sourceLocators: [] }];
    await expect(
      system.planning.commands.create({
        profile: 'task',
        title: 'Inválida',
        objectiveId: 'missing',
        evidence,
      }),
    ).rejects.toThrow('objective');
    const taskId = await system.planning.commands.create({
      profile: 'task',
      title: 'Vencida',
      dueAt: '2020-01-01T00:00:00.000Z',
      evidence,
    });
    expect((await system.planning.queries.list('overdue')).map((item) => item.itemId)).toEqual([
      taskId,
    ]);
    await system.close();
  });
});

class EmptyInterpreter {
  readonly identity = Object.freeze({ key: 'empty' });
  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge' as const,
      draft: { entryId: request.entry.id, items: [], components: [] },
    };
  }
}
