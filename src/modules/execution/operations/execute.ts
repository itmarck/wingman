import { Attempt } from '../../../core/execution/attempt.js';
import type { CapabilityRegistry, CapabilityResult } from '../../../core/execution/capability.js';
import { Event } from '../../../core/execution/event.js';
import { type AutonomyLevel, resolveAutonomy } from '../../../core/execution/policy.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports.js';
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
  | 'consentRequired'
  | 'autonomyRestricted';

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
    if (intent.consent === 'explicit' && intent.status !== 'consented') {
      await this.event('consentRequired', intent.id, { consent: intent.consent });
      return 'consentRequired';
    }
    const authority = resolveAutonomy({
      global: this.policy.global,
      capability: capability.defaultAutonomy,
      user: this.policy.user,
      explicitlyConsented: intent.status === 'consented',
      safetyCeiling: capability.safetyCeiling,
    });
    if (authority !== 'execute') {
      await this.event('autonomyRestricted', intent.id, { authority });
      return 'autonomyRestricted';
    }
    const snapshot = await this.knowledge.loadKnowledge();
    if (
      intent.conditions.some((condition) => this.evaluator.evaluate(condition, snapshot) !== true)
    ) {
      await this.event('intentStale', intent.id, { status: 'stale' });
      return 'stale';
    }
    const attempts = await this.store.listAttempts(intent.id);
    const active = attempts.find(({ outcome }) => outcome === 'started');
    if (active) {
      const recovered = active.finish(
        'uncertain',
        this.clock.now().toISOString(),
        undefined,
        'Capability outcome is unknown after interrupted execution',
      );
      await this.store.finishAttempt(recovered, [
        this.createEvent(
          'attemptUncertain',
          intent.id,
          { attemptId: active.id, message: recovered.message ?? null },
          active.id,
        ),
      ]);
      return 'uncertain';
    }
    const sequence = attempts.length + 1;
    const attemptId = this.ids.generate();
    const startedAt = this.clock.now().toISOString();
    const idempotencyKey = capability.idempotencyKey(intent.input, intent.id);
    const started = Attempt.create({
      id: attemptId,
      intentId: intent.id,
      sequence,
      idempotencyKey,
      startedAt,
    });
    await this.store.reserveAttempt(started);
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
      const finished = started.finish(
        'failed',
        this.clock.now().toISOString(),
        undefined,
        result.message ?? 'Unsupported input',
      );
      await this.store.finishAttempt(finished, [
        this.createEvent(
          'capabilityUnsupported',
          intent.id,
          {
            message: result.message ?? 'Unsupported input',
          },
          attemptId,
        ),
      ]);
      return 'unsupported';
    }
    const outcome =
      result.kind === 'success' ? 'succeeded' : result.kind === 'failure' ? 'failed' : 'uncertain';
    const attempt = started.finish(
      outcome,
      this.clock.now().toISOString(),
      result.output,
      result.message,
    );
    const events = [
      this.createEvent(
        `attempt${capitalize(outcome)}`,
        intent.id,
        { attemptId, output: result.output ?? null, message: result.message ?? null },
        attempt.id,
      ),
      ...(result.events ?? []).map((occurrence) =>
        this.createEvent(occurrence.key, intent.id, occurrence.data, attempt.id),
      ),
    ];
    await this.store.finishAttempt(
      attempt,
      events,
      outcome === 'succeeded' ? intent.complete() : undefined,
    );
    return outcome;
  }
  private async event(
    key: string,
    intentId: string,
    data: ComponentValue,
    attemptId?: string,
  ): Promise<void> {
    await this.store.appendEvent(this.createEvent(key, intentId, data, attemptId));
  }
  private createEvent(
    key: string,
    intentId: string,
    data: ComponentValue,
    attemptId?: string,
  ): Event {
    return Event.create({
      id: this.ids.generate(),
      key,
      occurredAt: this.clock.now().toISOString(),
      causation: { intentId, attemptId },
      data,
    });
  }
}
function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
