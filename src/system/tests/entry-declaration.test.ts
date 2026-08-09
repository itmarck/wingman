import { describe, expect, it } from 'vitest';
import type { ComponentValue } from '../../core/item/types.js';
import { MemoryDeclarationRegistry } from '../../modules/interpretation/adapters/memory/declaration.js';
import type { ItemDeclaration } from '../../modules/interpretation/domain/declaration.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import { EntryDeclarationPublisher } from '../declaration.js';
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
    expect(await system.reminder.manage.list()).toHaveLength(1);
    expect(await system.automation.store.list()).toHaveLength(1);
    expect(await system.execution.store.listIntents()).toEqual([]);
    await system.close();
  });

  it('deduplicates declarations and records unavailable contracts as unsupported', async () => {
    const outcomes = new MemoryDeclarationRegistry();
    let itemCalls = 0;
    const router = new EntryDeclarationPublisher(
      outcomes,
      { execute: async () => `item-${++itemCalls}` },
      { execute: async () => 'state' },
      {
        execute: async () => {
          throw new Error('Trigger event@1 is not registered');
        },
      },
      { execute: async () => 'intent' },
      { generate: () => 'automation-id' },
      { now: () => new Date('2026-08-02T12:00:00.000Z') },
    );
    const draft = {
      entryId: 'entry-idempotent',
      items: [],
      components: [],
      declarations: {
        items: [itemDeclaration('subject', [])],
        states: [],
        intents: [],
        automations: [
          {
            kind: 'automation' as const,
            version: 1 as const,
            reference: 'notice',
            dependsOn: ['subject'],
            unresolved: [],
            subjects: ['subject'],
            given: [],
            when: {
              operator: { key: 'event' as const, version: 1 as const },
              eventKey: 'emailReceived',
            },
            thenIntents: [],
          },
        ],
      },
    };
    await router.execute(draft);
    await router.execute(draft);
    expect(itemCalls).toBe(1);
    expect((await outcomes.list()).map(({ status }) => status)).toEqual(['applied', 'unsupported']);
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
        items: [],
        components: [],
        declarations: {
          items: [itemDeclaration('task', this.unresolved ? ['{bankName}'] : [], occurrence)],
          states: [],
          intents: [],
          automations: [
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
                  input: {
                    reminderId: 'notice',
                    occurrenceId: '$trigger.id',
                    subjectItemId: 'task',
                    message: 'Paga',
                  },
                  conditions: [],
                  expectedState: [],
                  authorization: 'none' as const,
                  trigger: { kind: 'time' as const, value: occurrence },
                },
              ],
              controls: { maxOccurrences: 1, deduplication: 'trigger' as const },
            },
          ],
        },
      },
    };
  }
}

function itemDeclaration(
  reference: string,
  unresolved: readonly string[],
  dueAt?: string,
): ItemDeclaration {
  const components: { key: string; version: number; value: ComponentValue }[] = [
    { key: 'descriptive', version: 1, value: { title: 'Pagar' } },
  ];
  if (dueAt) components.push({ key: 'temporal', version: 1, value: { dueAt } });
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
