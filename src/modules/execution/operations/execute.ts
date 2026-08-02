import { Attempt } from '../../../core/execution/attempt.js';
import type { CapabilityRegistry, CapabilityResult } from '../../../core/execution/capability.js';
import { Event } from '../../../core/execution/event.js';
import { type AutonomyLevel, resolveAutonomy } from '../../../core/execution/policy.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { StateEvaluator } from '../../state/services/evaluator.js';
import type { ExecutionStore } from '../ports/store.js';

export interface ExecutionPolicy {
  readonly global: AutonomyLevel;
  readonly user?: AutonomyLevel;
}
export type ExecutionOutcome =
  | 'succeeded'
  | 'failed'
  | 'uncertain'
  | 'stale'
  | 'unsupported'
  | 'cancelled'
  | 'authorizationRequired';

/** Rechecks authority and State immediately before every distinct Capability Attempt. */
export class ExecuteIntentCommand {
  constructor(
    private readonly store: ExecutionStore,
    private readonly capabilities: CapabilityRegistry,
    private readonly knowledge: InterpretationStore,
    private readonly evaluator: StateEvaluator,
    private readonly policy: ExecutionPolicy,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(intentId: string): Promise<ExecutionOutcome> {
    const intent = await this.store.findIntent(intentId);
    if (!intent) throw new NotFoundError(`Intent ${intentId} does not exist`);
    if (intent.status === 'cancelled') {
      await this.event('intentCancelled', intent.id, { status: 'cancelled' });
      return 'cancelled';
    }
    const capability = this.capabilities.find(intent.capability.key, intent.capability.version);
    if (!capability) {
      await this.event('capabilityUnsupported', intent.id, {
        key: intent.capability.key,
        version: intent.capability.version,
      });
      return 'unsupported';
    }
    const authority = resolveAutonomy({
      global: this.policy.global,
      capability: capability.defaultAutonomy,
      user: this.policy.user,
      explicitlyAuthorized: intent.status === 'authorized' || intent.authorization === 'none',
      safetyCeiling: capability.safetyCeiling,
    });
    if (authority !== 'execute') {
      await this.event('authorizationRequired', intent.id, { authority });
      return 'authorizationRequired';
    }
    const snapshot = await this.knowledge.loadKnowledge();
    if (
      intent.conditions.some((condition) => this.evaluator.evaluate(condition, snapshot) !== true)
    ) {
      await this.event('intentStale', intent.id, { status: 'stale' });
      return 'stale';
    }
    const attempts = await this.store.listAttempts(intent.id);
    const sequence = attempts.length + 1;
    const attemptId = this.ids.generate();
    const startedAt = this.clock.now().toISOString();
    const idempotencyKey = capability.idempotencyKey(intent.input, intent.id);
    let result: CapabilityResult;
    try {
      result = await capability.execute(intent.input, {
        intentId: intent.id,
        attemptId,
        idempotencyKey,
      });
    } catch (error) {
      result = {
        kind: 'failure',
        message: error instanceof Error ? error.message : 'Capability failed',
      };
    }
    if (result.kind === 'unsupported') {
      await this.event('capabilityUnsupported', intent.id, {
        message: result.message ?? 'Unsupported input',
      });
      return 'unsupported';
    }
    const outcome =
      result.kind === 'success' ? 'succeeded' : result.kind === 'failure' ? 'failed' : 'uncertain';
    const attempt = Attempt.create({
      id: attemptId,
      intentId: intent.id,
      sequence,
      idempotencyKey,
      startedAt,
    }).finish(outcome, this.clock.now().toISOString(), result.output, result.message);
    await this.store.appendAttempt(attempt);
    await this.event(
      `attempt${capitalize(outcome)}`,
      intent.id,
      { attemptId, output: result.output ?? null, message: result.message ?? null },
      attempt.id,
    );
    for (const occurrence of result.events ?? [])
      await this.event(occurrence.key, intent.id, occurrence.data, attempt.id);
    if (outcome === 'succeeded') await this.store.saveIntent(intent.complete());
    return outcome;
  }
  private async event(
    key: string,
    intentId: string,
    data: ComponentValue,
    attemptId?: string,
  ): Promise<void> {
    await this.store.appendEvent(
      Event.create({
        id: this.ids.generate(),
        key,
        occurredAt: this.clock.now().toISOString(),
        causation: { intentId, attemptId },
        data,
      }),
    );
  }
}
function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
