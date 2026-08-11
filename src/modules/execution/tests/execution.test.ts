import { describe, expect, it } from 'vitest';
import { Attempt } from '../../../core/execution/attempt.js';
import {
  type Capability,
  CapabilityRegistry,
  type CapabilityResult,
} from '../../../core/execution/capability.js';
import { Intent } from '../../../core/execution/intent.js';
import { resolveAutonomy } from '../../../core/execution/policy.js';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { createOperatorRegistry } from '../../../core/state/registry.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { StateEvaluator } from '../../state/services/evaluator.js';
import { MemoryExecutionStore } from '../adapters/memory/store.js';
import { CancelIntentCommand, GrantIntentConsentCommand } from '../operations/control.js';
import { ExecuteIntentCommand } from '../operations/execute.js';
import { ProposeIntentCommand } from '../operations/propose.js';
import { ExecutionWorker } from '../operations/worker.js';

describe('Intent execution', () => {
  it('keeps Capability registration immutable and resolves hierarchical autonomy safely', () => {
    const capabilities = new CapabilityRegistry();
    const capability = new FakeCapability();
    capabilities.register(capability);
    expect(() => capabilities.register(capability)).toThrow('already registered');
    expect(() => capabilities.register(copyCapability(capability, 'external.fake'))).toThrow(
      'unqualified',
    );
    expect(
      resolveAutonomy({
        global: 'execute',
        capability: 'propose',
        explicitlyConsented: false,
        safetyCeiling: 'execute',
      }),
    ).toBe('propose');
    expect(
      resolveAutonomy({
        global: 'execute',
        capability: 'propose',
        explicitlyConsented: true,
        safetyCeiling: 'execute',
      }),
    ).toBe('execute');
    expect(
      resolveAutonomy({ global: 'execute', explicitlyConsented: true, safetyCeiling: 'propose' }),
    ).toBe('propose');
  });

  it('records consent, retries uncertain effects idempotently and preserves Attempts and Events', async () => {
    const fixture = await createFixture();
    const intentId = await fixture.propose.execute(input('uncertain', true));
    await expect(fixture.execute.execute(intentId)).resolves.toBe('consentRequired');
    await fixture.consent.execute(intentId);
    await expect(fixture.execute.execute(intentId)).resolves.toBe('uncertain');
    await expect(fixture.execute.execute(intentId)).resolves.toBe('succeeded');
    const attempts = await fixture.store.listAttempts(intentId);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual(['uncertain', 'succeeded']);
    expect(new Set(attempts.map((attempt) => attempt.idempotencyKey)).size).toBe(1);
    expect(fixture.capability.effects).toBe(1);
    expect((await fixture.store.listEvents(intentId)).map((event) => event.key)).toEqual([
      'consentRequired',
      'attemptUncertain',
      'attemptSucceeded',
    ]);
    expect((await fixture.knowledge.loadKnowledge()).revisions).toEqual([]);
  });

  it('records failure, unsupported capability, cancellation and stale State without invented Attempts', async () => {
    const fixture = await createFixture();
    const failedId = await fixture.propose.execute(input('failure', false));
    expect(await fixture.execute.execute(failedId)).toBe('failed');
    expect((await fixture.store.listAttempts(failedId))[0]?.outcome).toBe('failed');

    await expect(fixture.propose.execute(input('invalid', false))).rejects.toThrow(
      'unsupported input',
    );
    const unknown = Intent.create({
      ...input('success', false),
      id: 'unknown-intent',
      capability: { key: 'missing', version: 1 },
      createdAt: fixture.clock.now().toISOString(),
    });
    await fixture.store.saveIntent(unknown);
    expect(await fixture.execute.execute(unknown.id)).toBe('unsupported');
    expect(await fixture.store.listAttempts(unknown.id)).toEqual([]);

    const staleId = await fixture.propose.execute({
      ...input('success', false),
      conditions: [condition(false)],
    });
    expect(await fixture.execute.execute(staleId)).toBe('stale');
    expect(await fixture.store.listAttempts(staleId)).toEqual([]);

    const cancelledId = await fixture.propose.execute(input('success', false));
    await fixture.cancel.execute(cancelledId);
    expect(await fixture.execute.execute(cancelledId)).toBe('cancelled');
  });

  it('never elevates autonomy without consent or exceeds a Capability safety ceiling', async () => {
    const proposed = await createFixture(new FakeCapability('execute', 'propose'));
    const proposedId = await proposed.propose.execute(input('success', false));
    expect(await proposed.execute.execute(proposedId)).toBe('autonomyRestricted');
    expect(await proposed.store.listAttempts(proposedId)).toEqual([]);

    const fixture = await createFixture(new FakeCapability('propose'));
    const intentId = await fixture.propose.execute(input('success', true));
    await fixture.consent.execute(intentId);
    expect(await fixture.execute.execute(intentId)).toBe('autonomyRestricted');
    expect(await fixture.store.listAttempts(intentId)).toEqual([]);
  });

  it('executes eligible Intents generically and leaves explicit consent pending', async () => {
    const fixture = await createFixture();
    const automatic = await fixture.propose.execute(input('success', false));
    const explicit = await fixture.propose.execute(input('success', true));
    const worker = new ExecutionWorker(fixture.store, fixture.execute);

    expect(await worker.runPending()).toBe(1);
    expect((await fixture.store.findIntent(automatic))?.status).toBe('completed');
    expect((await fixture.store.findIntent(explicit))?.status).toBe('proposed');
    expect(await worker.runPending()).toBe(0);
  });

  it('settles an interrupted started Attempt as uncertain without invoking the Capability again', async () => {
    const fixture = await createFixture();
    const intentId = await fixture.propose.execute(input('success', false));
    await fixture.store.reserveAttempt(
      Attempt.create({
        id: 'interrupted-attempt',
        intentId,
        sequence: 1,
        idempotencyKey: `fake:${intentId}`,
        startedAt: fixture.clock.now().toISOString(),
      }),
    );
    const worker = new ExecutionWorker(fixture.store, fixture.execute);

    expect(await worker.runPending()).toBe(1);
    expect((await fixture.store.listAttempts(intentId))[0]?.outcome).toBe('uncertain');
    expect(fixture.capability.effects).toBe(0);
  });
});

class FakeCapability implements Capability {
  readonly key = 'fake';
  readonly version = 1;
  readonly description = 'Fake deterministic effect';
  readonly #completed = new Set<string>();
  effects = 0;
  constructor(
    readonly safetyCeiling: Capability['safetyCeiling'] = 'execute',
    readonly defaultAutonomy: Capability['defaultAutonomy'] = 'execute',
  ) {}
  validateInput(input: ComponentValue): void {
    if (!isInput(input) || input.mode === 'invalid') throw new Error('unsupported input');
  }
  idempotencyKey(_input: ComponentValue, intentId: string): string {
    return `fake:${intentId}`;
  }
  async execute(
    input: ComponentValue,
    context: { readonly idempotencyKey: string },
  ): Promise<CapabilityResult> {
    if (!isInput(input)) return { kind: 'unsupported' };
    if (input.mode === 'failure') return { kind: 'failure', message: 'fake failed' };
    if (input.mode === 'unsupported') return { kind: 'unsupported' };
    if (this.#completed.has(context.idempotencyKey))
      return { kind: 'success', output: { reused: true } };
    this.effects += 1;
    this.#completed.add(context.idempotencyKey);
    return input.mode === 'uncertain'
      ? { kind: 'uncertain', message: 'result lost' }
      : { kind: 'success', output: { delivered: true } };
  }
}

async function createFixture(capability = new FakeCapability()) {
  const clock = { now: () => new Date('2026-08-02T16:00:00Z') };
  let sequence = 0;
  const ids = { generate: () => `execution-${++sequence}` };
  const operators = createOperatorRegistry();
  const capabilities = new CapabilityRegistry();
  capabilities.register(capability);
  const knowledge = new MemoryKnowledgeStore(createKnowledgeRegistry());
  await knowledge.saveEntry(
    Entry.create({
      id: 'entry-execution',
      content: { kind: 'text', text: 'Ejecuta el efecto.' },
      origin: { source: 'test' },
      capturedAt: clock.now().toISOString(),
    }),
  );
  const store = new MemoryExecutionStore();
  const evaluator = new StateEvaluator(operators, clock);
  return {
    capability,
    clock,
    knowledge,
    store,
    propose: new ProposeIntentCommand(store, capabilities, operators, knowledge, ids, clock),
    consent: new GrantIntentConsentCommand(store),
    cancel: new CancelIntentCommand(store, ids, clock),
    execute: new ExecuteIntentCommand(
      store,
      capabilities,
      knowledge,
      evaluator,
      { global: 'execute' },
      ids,
      clock,
    ),
  };
}

function input(mode: string, explicit: boolean) {
  return {
    capability: { key: 'fake', version: 1 },
    input: { mode },
    proposer: { kind: 'user' as const, id: 'marcelo' },
    conditions: [condition(true)],
    expectedState: [condition(true)],
    consent: explicit ? ('explicit' as const) : ('none' as const),
    evidence: [{ entryId: 'entry-execution', sourceLocators: [] }],
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
function isInput(value: ComponentValue): value is { readonly mode: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { readonly mode?: unknown }).mode === 'string',
  );
}

function copyCapability(capability: Capability, key: string): Capability {
  return {
    key,
    version: capability.version,
    description: capability.description,
    defaultAutonomy: capability.defaultAutonomy,
    safetyCeiling: capability.safetyCeiling,
    validateInput: capability.validateInput.bind(capability),
    idempotencyKey: capability.idempotencyKey.bind(capability),
    execute: capability.execute.bind(capability),
  };
}
