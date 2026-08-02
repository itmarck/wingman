import type { Event } from '../../../core/execution/event.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { Rule } from '../../../core/rule/rule.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ProposeIntentCommand } from '../../execution/operations/propose.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { StateEvaluator } from '../../state/services/evaluator.js';
import type { RuleRuntime, RuleStore, StateChangeSignal } from '../ports/store.js';

interface TriggerContext {
  readonly kind: 'time' | 'event' | 'stateChange';
  readonly id: string;
  readonly occurredAt: string;
  readonly data: ComponentValue;
}
export class RuleWorker {
  constructor(
    private readonly store: RuleStore,
    private readonly knowledge: InterpretationStore,
    private readonly evaluator: StateEvaluator,
    private readonly intents: Pick<ProposeIntentCommand, 'execute'>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async runDue(): Promise<number> {
    const now = this.clock.now().toISOString();
    const rules = await this.store.due(now);
    for (const runtime of rules)
      await this.evaluate(runtime, {
        kind: 'time',
        id: runtime.nextEvaluationAt ?? now,
        occurredAt: now,
        data: { scheduledFor: runtime.nextEvaluationAt ?? now },
      });
    return rules.length;
  }
  async handleEvent(event: Event): Promise<number> {
    const rules = await this.store.forEvent(event);
    for (const runtime of rules)
      await this.evaluate(runtime, {
        kind: 'event',
        id: event.id,
        occurredAt: event.occurredAt,
        data: event.data,
      });
    return rules.length;
  }
  async handleStateChange(signal: StateChangeSignal): Promise<number> {
    const rules = await this.store.forStateChange(signal);
    for (const runtime of rules)
      await this.evaluate(runtime, {
        kind: 'stateChange',
        id: signal.id,
        occurredAt: signal.occurredAt,
        data: { itemIds: signal.itemIds, componentKeys: signal.componentKeys },
      });
    return rules.length;
  }
  private async evaluate(runtime: RuleRuntime, trigger: TriggerContext): Promise<void> {
    const { rule } = runtime;
    const now = this.clock.now().toISOString();
    const deduplicationId = occurrenceIdentity(rule, trigger, runtime.occurrences + 1);
    if (runtime.deduplicationIds.has(deduplicationId))
      return this.record(runtime, trigger, 'duplicate', 'Trigger already processed', []);
    if (rule.policy.expiresAt && rule.policy.expiresAt <= now)
      return this.stop(runtime, trigger, 'expired', 'Rule expired');
    if (
      rule.policy.maxOccurrences !== undefined &&
      runtime.occurrences >= rule.policy.maxOccurrences
    )
      return this.stop(runtime, trigger, 'stopped', 'Occurrence limit reached');
    const snapshot = await this.knowledge.loadKnowledge();
    if (rule.policy.stopWhen && this.evaluator.evaluate(rule.policy.stopWhen, snapshot) === true)
      return this.stop(runtime, trigger, 'stopped', 'Stopping condition is true');
    if (
      runtime.lastProducedAt &&
      rule.policy.cooldownMs &&
      Date.parse(now) < Date.parse(runtime.lastProducedAt) + rule.policy.cooldownMs
    )
      return this.finish(runtime, trigger, 'cooldown', 'Rule is cooling down', []);
    if (rule.given.some((condition) => this.evaluator.evaluate(condition, snapshot) !== true))
      return this.finish(runtime, trigger, 'givenFalse', 'Given condition is not satisfied', []);
    const intentIds: string[] = [];
    for (const template of rule.thenIntents)
      intentIds.push(
        await this.intents.execute({
          ...template,
          proposer: { kind: 'rule', id: rule.id },
          evidence: rule.evidence,
        }),
      );
    await this.finish(
      runtime,
      trigger,
      'produced',
      'Intent templates instantiated',
      intentIds,
      true,
      deduplicationId,
    );
  }
  private async finish(
    runtime: RuleRuntime,
    trigger: TriggerContext,
    outcome: 'produced' | 'givenFalse' | 'expired' | 'cooldown',
    reason: string,
    intentIds: readonly string[],
    produced = false,
    deduplicationId = occurrenceIdentity(runtime.rule, trigger, runtime.occurrences + 1),
  ): Promise<void> {
    const seen = new Set(runtime.deduplicationIds);
    seen.add(deduplicationId);
    const occurrences = runtime.occurrences + (produced ? 1 : 0);
    const nextEvaluationAt = nextTime(runtime, trigger);
    const shouldStop =
      produced &&
      runtime.rule.policy.maxOccurrences !== undefined &&
      occurrences >= runtime.rule.policy.maxOccurrences;
    await this.store.save({
      ...runtime,
      rule: shouldStop ? runtime.rule.stop() : runtime.rule,
      occurrences,
      lastProducedAt: produced ? this.clock.now().toISOString() : runtime.lastProducedAt,
      nextEvaluationAt,
      deduplicationIds: seen,
    });
    await this.record(runtime, trigger, outcome, reason, intentIds);
  }
  private async stop(
    runtime: RuleRuntime,
    trigger: TriggerContext,
    outcome: 'stopped' | 'expired',
    reason: string,
  ): Promise<void> {
    await this.store.save({ ...runtime, rule: runtime.rule.stop(), nextEvaluationAt: undefined });
    await this.record(runtime, trigger, outcome, reason, []);
  }
  private async record(
    runtime: RuleRuntime,
    trigger: TriggerContext,
    outcome: 'produced' | 'givenFalse' | 'stopped' | 'expired' | 'cooldown' | 'duplicate',
    reason: string,
    intentIds: readonly string[],
  ): Promise<void> {
    await this.store.appendResult({
      id: this.ids.generate(),
      ruleId: runtime.rule.id,
      triggerId: trigger.id,
      evaluatedAt: this.clock.now().toISOString(),
      outcome,
      intentIds,
      reason,
    });
  }
}

export function occurrenceIdentity(
  rule: Rule,
  trigger: TriggerContext,
  occurrence: number,
): string {
  const policy = rule.policy.deduplication ?? 'trigger';
  return policy === 'none'
    ? `${rule.id}:none:${occurrence}:${trigger.id}`
    : policy === 'occurrence'
      ? `${rule.id}:occurrence:${occurrence}`
      : `${rule.id}:${trigger.kind}:${trigger.id}`;
}
function nextTime(runtime: RuleRuntime, trigger: TriggerContext): string | undefined {
  return runtime.rule.when.operator.key === 'time' && runtime.rule.policy.repeatEveryMs
    ? new Date(Date.parse(trigger.occurredAt) + runtime.rule.policy.repeatEveryMs).toISOString()
    : undefined;
}
