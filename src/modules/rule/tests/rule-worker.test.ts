import { describe, expect, it } from 'vitest';
import { type Capability, CapabilityRegistry } from '../../../core/execution/capability.js';
import { Event } from '../../../core/execution/event.js';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { createTriggerRegistry } from '../../../core/rule/registry.js';
import { createOperatorRegistry } from '../../../core/state/registry.js';
import { MemoryExecutionStore } from '../../execution/adapters/memory/store.js';
import { ProposeIntentCommand } from '../../execution/operations/propose.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { StateEvaluator } from '../../state/services/evaluator.js';
import { MemoryRuleStore } from '../adapters/memory/store.js';
import { RegisterRuleCommand, type RegisterRuleInput } from '../operations/register.js';
import { RuleWorker } from '../operations/worker.js';

describe('declarative Rule worker', () => {
  it('records false Given and handles repetition, stopping and expiration', async () => {
    const fixture = await createFixture();
    const falseRule = await fixture.register.execute(
      ruleInput(
        { operator: { key: 'time', version: 1 }, afterMs: 0 },
        { given: [condition(false)] },
      ),
    );
    expect(await fixture.worker.runDue()).toBe(1);
    expect(await fixture.rules.listResults(falseRule)).toMatchObject([{ outcome: 'givenFalse' }]);
    const repeatRule = await fixture.register.execute(
      ruleInput(
        { operator: { key: 'time', version: 1 }, afterMs: 0 },
        { policy: { repeatEveryMs: 1000, maxOccurrences: 2 } },
      ),
    );
    await fixture.worker.runDue();
    fixture.clock.advance(1000);
    await fixture.worker.runDue();
    expect((await fixture.rules.find(repeatRule))?.rule.status).toBe('stopped');
    expect(
      (await fixture.execution.listIntents()).filter((intent) => intent.proposer.id === repeatRule),
    ).toHaveLength(2);
    const expired = await fixture.register.execute(
      ruleInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'tick' },
        { policy: { expiresAt: '2026-08-02T16:00:00Z' } },
      ),
    );
    fixture.clock.advance(1000);
    await fixture.worker.handleEvent(
      event('expired-event', 'tick', fixture.clock.now().toISOString()),
    );
    expect((await fixture.rules.find(expired))?.rule.status).toBe('stopped');
    expect(await fixture.rules.listResults(expired)).toMatchObject([{ outcome: 'expired' }]);
  });

  it('deduplicates Events, applies cooldown and stops on State', async () => {
    const fixture = await createFixture();
    const duplicateRule = await fixture.register.execute(
      ruleInput({ operator: { key: 'event', version: 1 }, eventKey: 'tick' }),
    );
    const occurrence = event('event-one', 'tick', fixture.clock.now().toISOString());
    await fixture.worker.handleEvent(occurrence);
    await fixture.worker.handleEvent(occurrence);
    expect(await fixture.rules.listResults(duplicateRule)).toMatchObject([
      { outcome: 'produced' },
      { outcome: 'duplicate' },
    ]);
    expect(
      (await fixture.execution.listIntents()).filter(
        (intent) => intent.proposer.id === duplicateRule,
      ),
    ).toHaveLength(1);
    const cooldownRule = await fixture.register.execute(
      ruleInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'cool' },
        { policy: { cooldownMs: 5000 } },
      ),
    );
    await fixture.worker.handleEvent(event('cool-1', 'cool', fixture.clock.now().toISOString()));
    await fixture.worker.handleEvent(event('cool-2', 'cool', fixture.clock.now().toISOString()));
    expect(await fixture.rules.listResults(cooldownRule)).toMatchObject([
      { outcome: 'produced' },
      { outcome: 'cooldown' },
    ]);
    const stopped = await fixture.register.execute(
      ruleInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'stop' },
        { policy: { stopWhen: condition(true) } },
      ),
    );
    await fixture.worker.handleEvent(event('stop-1', 'stop', fixture.clock.now().toISOString()));
    expect((await fixture.rules.find(stopped))?.rule.status).toBe('stopped');
  });

  it('uses dependency indexes and rejects unknown triggers or Then templates', async () => {
    const fixture = await createFixture();
    const ruleId = await fixture.register.execute(
      ruleInput({ operator: { key: 'stateChange', version: 1 }, componentKeys: ['status'] }),
    );
    expect(
      await fixture.worker.handleStateChange({
        id: 'unrelated',
        occurredAt: fixture.clock.now().toISOString(),
        itemIds: [],
        componentKeys: ['location'],
      }),
    ).toBe(0);
    expect(await fixture.rules.listResults(ruleId)).toEqual([]);
    expect(
      await fixture.worker.handleStateChange({
        id: 'related',
        occurredAt: fixture.clock.now().toISOString(),
        itemIds: [],
        componentKeys: ['status'],
      }),
    ).toBe(1);
    await expect(
      fixture.register.execute(ruleInput({ operator: { key: 'unknown', version: 1 } } as never)),
    ).rejects.toThrow('not registered');
    await expect(
      fixture.register.execute({
        ...ruleInput({ operator: { key: 'event', version: 1 }, eventKey: 'tick' }),
        thenIntents: [{ ...template(), capability: { key: 'missing', version: 1 } }],
      }),
    ).rejects.toThrow('not registered');
  });
});

class FakeCapability implements Capability {
  readonly key = 'fakeRule';
  readonly version = 1;
  readonly description = 'Rule fake';
  readonly defaultAutonomy = 'propose' as const;
  readonly safetyCeiling = 'execute' as const;
  validateInput(input: ComponentValue): void {
    if (!input || typeof input !== 'object') throw new Error('invalid');
  }
  idempotencyKey(_input: ComponentValue, intentId: string): string {
    return intentId;
  }
  async execute(): Promise<{ readonly kind: 'success' }> {
    return { kind: 'success' };
  }
}

async function createFixture() {
  let timestamp = Date.parse('2026-08-02T16:00:00Z');
  let id = 0;
  const clock = {
    now: () => new Date(timestamp),
    advance: (milliseconds: number) => {
      timestamp += milliseconds;
    },
  };
  const ids = { generate: () => `rule-test-${++id}` };
  const knowledge = new MemoryKnowledgeStore(createKnowledgeRegistry());
  await knowledge.saveEntry(
    Entry.create({
      id: 'entry-rule',
      content: { kind: 'text', text: 'Regla de prueba.' },
      origin: { source: 'test' },
      capturedAt: clock.now().toISOString(),
    }),
  );
  const operators = createOperatorRegistry();
  const capabilities = new CapabilityRegistry();
  capabilities.register(new FakeCapability());
  const execution = new MemoryExecutionStore();
  const propose = new ProposeIntentCommand(
    execution,
    capabilities,
    operators,
    knowledge,
    ids,
    clock,
  );
  const rules = new MemoryRuleStore();
  return {
    clock,
    execution,
    rules,
    register: new RegisterRuleCommand(
      rules,
      createTriggerRegistry(),
      operators,
      capabilities,
      knowledge,
      ids,
      clock,
    ),
    worker: new RuleWorker(
      rules,
      knowledge,
      new StateEvaluator(operators, clock),
      propose,
      ids,
      clock,
    ),
  };
}

function ruleInput(
  when: RegisterRuleInput['when'],
  overrides: Partial<RegisterRuleInput> = {},
): RegisterRuleInput {
  return {
    given: [condition(true)],
    when,
    thenIntents: [template()],
    evidence: [{ entryId: 'entry-rule', sourceLocators: [] }],
    ...overrides,
  };
}
function template() {
  return {
    capability: { key: 'fakeRule', version: 1 },
    input: { message: 'hola' },
    conditions: [condition(true)],
    expectedState: [condition(true)],
    authorization: 'explicit' as const,
  };
}
function condition(value: boolean) {
  return {
    operator: { key: 'equal', version: 1 },
    operands: [
      { kind: 'literal' as const, value },
      { kind: 'literal' as const, value: true },
    ],
  };
}
function event(id: string, key: string, occurredAt: string): Event {
  return Event.create({
    id,
    key,
    occurredAt,
    causation: { entryId: 'entry-rule' },
    data: { active: true },
  });
}
