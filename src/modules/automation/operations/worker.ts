import type { Automation } from '../../../core/automation/automation.js';
import type { Event } from '../../../core/execution/event.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ProposeIntentCommand } from '../../execution/operations/propose.js';
import type { InterpretationStore } from '../../interpretation/ports.js';
import type { StateEvaluator } from '../../state/services/evaluator.js';
import type { AutomationRuntime, AutomationStore, StateChangeSignal } from '../ports/store.js';

interface TriggerContext {
  readonly kind: 'time' | 'event' | 'stateChange';
  readonly id: string;
  readonly occurredAt: string;
  readonly data: ComponentValue;
}
export class AutomationWorker {
  constructor(
    private readonly store: AutomationStore,
    private readonly knowledge: InterpretationStore,
    private readonly evaluator: StateEvaluator,
    private readonly intents: Pick<ProposeIntentCommand, 'execute'>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async runDue(): Promise<number> {
    const now = this.clock.now().toISOString();
    let processed = 0;
    for (;;) {
      const automations = await this.store.due(now);
      if (automations.length === 0) return processed;
      for (const runtime of automations) {
        await this.evaluate(runtime, {
          kind: 'time',
          id: runtime.nextEvaluationAt ?? now,
          occurredAt: now,
          data: { scheduledFor: runtime.nextEvaluationAt ?? now },
        });
        processed += 1;
      }
      if (processed >= 10_000) throw new Error('Automation due-work limit exceeded');
    }
  }
  async handleEvent(event: Event): Promise<number> {
    const automations = await this.store.forEvent(event);
    for (const runtime of automations)
      await this.evaluate(runtime, {
        kind: 'event',
        id: event.id,
        occurredAt: event.occurredAt,
        data: event.data,
      });
    return automations.length;
  }
  async handleStateChange(signal: StateChangeSignal): Promise<number> {
    const automations = await this.store.forStateChange(signal);
    for (const runtime of automations)
      await this.evaluate(runtime, {
        kind: 'stateChange',
        id: signal.id,
        occurredAt: signal.occurredAt,
        data: { itemIds: signal.itemIds, componentKeys: signal.componentKeys },
      });
    return automations.length;
  }
  private async evaluate(runtime: AutomationRuntime, trigger: TriggerContext): Promise<void> {
    const { automation } = runtime;
    const now = this.clock.now().toISOString();
    const deduplicationId = occurrenceIdentity(automation, trigger, runtime.occurrences + 1);
    if (runtime.deduplicationIds.has(deduplicationId))
      return this.record(runtime, trigger, 'duplicate', 'Trigger already processed', []);
    if (automation.controls.expiresAt && automation.controls.expiresAt <= now)
      return this.stop(runtime, trigger, 'expired', 'Automation expired');
    if (
      automation.controls.maxOccurrences !== undefined &&
      runtime.occurrences >= automation.controls.maxOccurrences
    )
      return this.stop(runtime, trigger, 'stopped', 'Occurrence limit reached');
    const snapshot = await this.knowledge.loadKnowledge();
    if (
      automation.controls.stopWhen &&
      this.evaluator.evaluate(automation.controls.stopWhen, snapshot) === true
    )
      return this.stop(runtime, trigger, 'stopped', 'Stopping condition is true');
    if (
      runtime.lastProducedAt &&
      automation.controls.cooldownMs &&
      Date.parse(now) < Date.parse(runtime.lastProducedAt) + automation.controls.cooldownMs
    )
      return this.finish(runtime, trigger, 'cooldown', 'Automation is cooling down', []);
    if (automation.given.some((condition) => this.evaluator.evaluate(condition, snapshot) !== true))
      return this.finish(runtime, trigger, 'givenFalse', 'Given condition is not satisfied', []);
    const intentIds: string[] = [];
    for (const template of automation.thenIntents)
      intentIds.push(
        await this.intents.execute({
          ...template,
          input: materialize(template.input, trigger),
          trigger: {
            kind: trigger.kind === 'stateChange' ? 'event' : trigger.kind,
            value: trigger.id,
          },
          proposer: { kind: 'automation', id: automation.id },
          evidence: automation.evidence,
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
    runtime: AutomationRuntime,
    trigger: TriggerContext,
    outcome: 'produced' | 'givenFalse' | 'expired' | 'cooldown',
    reason: string,
    intentIds: readonly string[],
    produced = false,
    deduplicationId = occurrenceIdentity(runtime.automation, trigger, runtime.occurrences + 1),
  ): Promise<void> {
    const seen = new Set(runtime.deduplicationIds);
    seen.add(deduplicationId);
    const occurrences = runtime.occurrences + (produced ? 1 : 0);
    const nextEvaluationAt = nextTime(runtime, trigger);
    const shouldStop =
      (produced &&
        runtime.automation.controls.maxOccurrences !== undefined &&
        occurrences >= runtime.automation.controls.maxOccurrences) ||
      (isFiniteTimeTrigger(runtime.automation) && nextEvaluationAt === undefined);
    await this.store.save({
      ...runtime,
      automation: shouldStop ? runtime.automation.stop() : runtime.automation,
      occurrences,
      lastProducedAt: produced ? this.clock.now().toISOString() : runtime.lastProducedAt,
      nextEvaluationAt,
      deduplicationIds: seen,
    });
    await this.record(runtime, trigger, outcome, reason, intentIds);
  }
  private async stop(
    runtime: AutomationRuntime,
    trigger: TriggerContext,
    outcome: 'stopped' | 'expired',
    reason: string,
  ): Promise<void> {
    await this.store.save({
      ...runtime,
      automation: runtime.automation.stop(),
      nextEvaluationAt: undefined,
    });
    await this.record(runtime, trigger, outcome, reason, []);
  }
  private async record(
    runtime: AutomationRuntime,
    trigger: TriggerContext,
    outcome: 'produced' | 'givenFalse' | 'stopped' | 'expired' | 'cooldown' | 'duplicate',
    reason: string,
    intentIds: readonly string[],
  ): Promise<void> {
    await this.store.appendResult({
      id: this.ids.generate(),
      automationId: runtime.automation.id,
      triggerId: trigger.id,
      evaluatedAt: this.clock.now().toISOString(),
      outcome,
      intentIds,
      reason,
    });
  }
}
function materialize(value: ComponentValue, trigger: TriggerContext): ComponentValue {
  if (value === '$trigger.id') return trigger.id;
  if (value === '$trigger.occurredAt') return trigger.occurredAt;
  if (Array.isArray(value)) return value.map((child) => materialize(child, trigger));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, materialize(child, trigger)]),
    );
  return value;
}

export function occurrenceIdentity(
  automation: Automation,
  trigger: TriggerContext,
  occurrence: number,
): string {
  const deduplication = automation.controls.deduplication ?? 'trigger';
  return deduplication === 'none'
    ? `${automation.id}:none:${occurrence}:${trigger.id}`
    : deduplication === 'occurrence'
      ? `${automation.id}:occurrence:${occurrence}`
      : `${automation.id}:${trigger.kind}:${trigger.id}`;
}
function nextTime(runtime: AutomationRuntime, trigger: TriggerContext): string | undefined {
  if (runtime.automation.when.operator.key === 'schedule') {
    const schedule = runtime.automation.when as Extract<
      Automation['when'],
      { operator: { key: 'schedule' } }
    >;
    return schedule.occurrences.find((occurrence) => occurrence > trigger.id);
  }
  return runtime.automation.when.operator.key === 'time' &&
    runtime.automation.controls.repeatEveryMs
    ? new Date(
        Date.parse(trigger.occurredAt) + runtime.automation.controls.repeatEveryMs,
      ).toISOString()
    : undefined;
}
function isFiniteTimeTrigger(automation: Automation): boolean {
  return (
    automation.when.operator.key === 'schedule' ||
    (automation.when.operator.key === 'time' && !automation.controls.repeatEveryMs)
  );
}
