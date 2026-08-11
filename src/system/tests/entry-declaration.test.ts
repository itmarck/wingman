import { describe, expect, it } from 'vitest';
import type { ItemDeclaration } from '../../modules/interpretation/domain/declaration.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import { createTestSystem } from './support.js';

describe('interpreted Entry declarations', () => {
  it('records unresolved declarations without creating executable state', async () => {
    const system = createTestSystem({ adapter: new DeclarationInterpreter(true) });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Recuérdame anular la tarjeta de {bankName}' },
      origin: { source: 'test' },
    });
    expect(await system.interpretation.processNext.execute()).toBe(true);
    const status = await system.interpretation.getEntryStatus.execute(entryId);
    expect(status.status).toBe('completed');
    expect(status.declarationStatus).toBe('needsInput');
    expect(status.declarations.map((outcome) => outcome.status)).toEqual([
      'needsInput',
      'needsInput',
    ]);
    expect(await system.planning.queries.list('pending')).toEqual([]);
    expect(await system.automation.store.list()).toEqual([]);
    expect(await system.execution.store.listIntents()).toEqual([]);
    await system.close();
  });

  it('composes a Profile and one scheduled notification Automation without executing it', async () => {
    const system = createTestSystem({ adapter: new DeclarationInterpreter(false) });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Recuérdame pagar mañana' },
      origin: { source: 'test' },
    });
    expect(await system.interpretation.processNext.execute()).toBe(true);
    const status = await system.interpretation.getEntryStatus.execute(entryId);
    expect(status.declarations.map(({ status: value }) => value)).toEqual(['applied', 'applied']);
    expect(await system.planning.queries.list('pending')).toHaveLength(1);
    expect(await system.execution.notifications.list()).toEqual([]);
    expect(await system.automation.store.list()).toHaveLength(1);
    expect(await system.execution.store.listIntents()).toEqual([]);
    await system.close();
  });

  it('publishes an uncertain Item after its Review is resolved', async () => {
    const system = createTestSystem({ adapter: new ReviewInterpreter() });
    const entryId = await system.capture.captureEntry.execute({
      content: { kind: 'text', text: 'Alex es importante' },
      origin: { source: 'test' },
    });

    expect(await system.interpretation.processNext.execute()).toBe(true);
    expect((await system.interpretation.getEntryStatus.execute(entryId)).status).toBe('pending');
    const review = (await system.interpretation.listReviews.execute()).items[0];
    expect(review?.resolution.proposed.reference).toBe('alex');
    if (!review) throw new Error('Expected a pending Review');

    await system.interpretation.resolveReview.execute({
      reviewId: review.id,
      decision: { reference: 'alex' },
    });

    const status = await system.interpretation.getEntryStatus.execute(entryId);
    expect(status.status).toBe('completed');
    expect(status.declarations.map(({ status: value }) => value)).toEqual(['applied']);
    expect((await system.projection.read('system.currentItems')).data).toMatchObject({
      items: [expect.objectContaining({ profile: { key: 'task', version: 1 } })],
    });
    await system.close();
  });
});

class DeclarationInterpreter {
  readonly identity = Object.freeze({ key: 'declarations' });
  constructor(private readonly unresolved: boolean) {}
  async interpret(request: InterpretationRequest) {
    const occurrence = new Date(Date.now() + 86_400_000).toISOString();
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        declarations: [
          itemDeclaration('task', this.unresolved ? ['{bankName}'] : [], occurrence),
          {
            kind: 'automation' as const,
            version: 1 as const,
            reference: 'notice',
            dependsOn: ['task'],
            unresolved: [],
            subjects: ['task'],
            given: [],
            when: {
              operator: { key: 'schedule' as const, version: 1 as const },
              occurrences: [occurrence],
            },
            thenIntents: [
              {
                capability: { key: 'notification', version: 1 },
                input: { message: 'Paga' },
                conditions: [],
                expectedState: [],
                consent: 'none' as const,
                trigger: { kind: 'time' as const, value: occurrence },
              },
            ],
            controls: { maxOccurrences: 1, deduplication: 'trigger' as const },
          },
        ],
      },
    };
  }
}

class ReviewInterpreter {
  readonly identity = Object.freeze({ key: 'review' });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        declarations: [
          {
            ...itemDeclaration('alex', []),
            referenceStatus: 'uncertain' as const,
            profile: { key: 'task' as const, version: 1 as const },
            components: [
              {
                reference: 'alex.descriptive',
                key: 'descriptive',
                schemaVersion: 1,
                value: { title: 'Alex es importante' },
              },
            ],
          },
        ],
      },
    };
  }
}

function itemDeclaration(
  reference: string,
  unresolved: readonly string[],
  dueAt?: string,
): ItemDeclaration {
  const components: ItemDeclaration['components'][number][] = [
    {
      reference: `${reference}.descriptive`,
      key: 'descriptive',
      schemaVersion: 1,
      value: { title: 'Pagar' },
    },
  ];
  if (dueAt)
    components.push({
      reference: `${reference}.temporal`,
      key: 'temporal',
      schemaVersion: 1,
      value: { dueAt },
    });
  return {
    kind: 'item' as const,
    version: 1 as const,
    reference,
    dependsOn: [],
    unresolved,
    profile: { key: 'task', version: 1 },
    components,
  };
}
