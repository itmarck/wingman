import { describe, expect, it } from 'vitest';
import { createTriggerRegistry } from '../../../core/automation/registry.js';
import { type Capability, CapabilityRegistry } from '../../../core/execution/capability.js';
import { Event } from '../../../core/execution/event.js';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { createOperatorRegistry } from '../../../core/state/registry.js';
import { MemoryExecutionStore } from '../../execution/adapters/memory/store.js';
import { ProposeIntentCommand } from '../../execution/operations/propose.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { StateEvaluator } from '../../state/services/evaluator.js';
import { MemoryAutomationStore } from '../adapters/memory/store.js';
import { RegisterAutomationCommand, type RegisterAutomationInput } from '../operations/register.js';
import { AutomationWorker } from '../operations/worker.js';

describe('declarative Automation worker', () => {
  it('records false Given and handles repetition, stopping and expiration', async () => {
    const fixture = await createFixture();
    const falseAutomation = await fixture.register.execute(
      automationInput(
        { operator: { key: 'time', version: 1 }, afterMs: 0 },
        { given: [condition(false)] },
      ),
    );
    expect(await fixture.worker.runDue()).toBe(1);
    expect(await fixture.automations.listResults(falseAutomation)).toMatchObject([
      { outcome: 'givenFalse' },
    ]);
    const repeatAutomation = await fixture.register.execute(
      automationInput(
        { operator: { key: 'time', version: 1 }, afterMs: 0 },
        { controls: { repeatEveryMs: 1000, maxOccurrences: 2 } },
      ),
    );
    await fixture.worker.runDue();
    fixture.clock.advance(1000);
    await fixture.worker.runDue();
    expect((await fixture.automations.find(repeatAutomation))?.automation.status).toBe('stopped');
    expect(
      (await fixture.execution.listIntents()).filter(
        (intent) => intent.proposer.id === repeatAutomation,
      ),
    ).toHaveLength(2);
    const expired = await fixture.register.execute(
      automationInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'tick' },
        { controls: { expiresAt: '2026-08-02T16:00:00Z' } },
      ),
    );
    fixture.clock.advance(1000);
    await fixture.worker.handleEvent(
      event('expired-event', 'tick', fixture.clock.now().toISOString()),
    );
    expect((await fixture.automations.find(expired))?.automation.status).toBe('stopped');
    expect(await fixture.automations.listResults(expired)).toMatchObject([{ outcome: 'expired' }]);
  });

  it('deduplicates Events, applies cooldown and stops on State', async () => {
    const fixture = await createFixture();
    const duplicateAutomation = await fixture.register.execute(
      automationInput({ operator: { key: 'event', version: 1 }, eventKey: 'tick' }),
    );
    const occurrence = event('event-one', 'tick', fixture.clock.now().toISOString());
    await fixture.worker.handleEvent(occurrence);
    await fixture.worker.handleEvent(occurrence);
    expect(await fixture.automations.listResults(duplicateAutomation)).toMatchObject([
      { outcome: 'produced' },
      { outcome: 'duplicate' },
    ]);
    expect(
      (await fixture.execution.listIntents()).filter(
        (intent) => intent.proposer.id === duplicateAutomation,
      ),
    ).toHaveLength(1);
    const cooldownAutomation = await fixture.register.execute(
      automationInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'cool' },
        { controls: { cooldownMs: 5000 } },
      ),
    );
    await fixture.worker.handleEvent(event('cool-1', 'cool', fixture.clock.now().toISOString()));
    await fixture.worker.handleEvent(event('cool-2', 'cool', fixture.clock.now().toISOString()));
    expect(await fixture.automations.listResults(cooldownAutomation)).toMatchObject([
      { outcome: 'produced' },
      { outcome: 'cooldown' },
    ]);
    const stopped = await fixture.register.execute(
      automationInput(
        { operator: { key: 'event', version: 1 }, eventKey: 'stop' },
        { controls: { stopWhen: condition(true) } },
      ),
    );
    await fixture.worker.handleEvent(event('stop-1', 'stop', fixture.clock.now().toISOString()));
    expect((await fixture.automations.find(stopped))?.automation.status).toBe('stopped');
  });

  it('uses dependency indexes and rejects unknown triggers or Then templates', async () => {
    const fixture = await createFixture();
    const automationId = await fixture.register.execute(
      automationInput({ operator: { key: 'stateChange', version: 1 }, componentKeys: ['status'] }),
    );
    expect(
      await fixture.worker.handleStateChange({
        id: 'unrelated',
        occurredAt: fixture.clock.now().toISOString(),
        itemIds: [],
        componentKeys: ['location'],
      }),
    ).toBe(0);
    expect(await fixture.automations.listResults(automationId)).toEqual([]);
    expect(
      await fixture.worker.handleStateChange({
        id: 'related',
        occurredAt: fixture.clock.now().toISOString(),
        itemIds: [],
        componentKeys: ['status'],
      }),
    ).toBe(1);
    await expect(
      fixture.register.execute(
        automationInput({ operator: { key: 'unknown', version: 1 } } as never),
      ),
    ).rejects.toThrow('not registered');
    await expect(
      fixture.register.execute({
        ...automationInput({ operator: { key: 'event', version: 1 }, eventKey: 'tick' }),
        thenIntents: [{ ...template(), capability: { key: 'missing', version: 1 } }],
      }),
    ).rejects.toThrow('not registered');
  });
});

class FakeCapability implements Capability {
  readonly key = 'fakeAutomation';
  readonly version = 1;
  readonly description = 'Automation fake';
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
  const ids = { generate: () => `automation-test-${++id}` };
  const knowledge = new MemoryKnowledgeStore(createKnowledgeRegistry());
  await knowledge.saveEntry(
    Entry.create({
      id: 'entry-automation',
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
  const automations = new MemoryAutomationStore(execution);
  return {
    clock,
    execution,
    automations,
    register: new RegisterAutomationCommand(
      automations,
      createTriggerRegistry(),
      operators,
      capabilities,
      knowledge,
      ids,
      clock,
    ),
    worker: new AutomationWorker(
      automations,
      knowledge,
      new StateEvaluator(operators, clock),
      propose,
      ids,
      clock,
    ),
  };
}

function automationInput(
  when: RegisterAutomationInput['when'],
  overrides: Partial<RegisterAutomationInput> = {},
): RegisterAutomationInput {
  return {
    given: [condition(true)],
    when,
    thenIntents: [template()],
    evidence: [{ entryId: 'entry-automation', sourceLocators: [] }],
    ...overrides,
  };
}
function template() {
  return {
    capability: { key: 'fakeAutomation', version: 1 },
    input: { message: 'hola' },
    conditions: [condition(true)],
    expectedState: [condition(true)],
    consent: 'explicit' as const,
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
    causation: { entryId: 'entry-automation' },
    data: { active: true },
  });
}
