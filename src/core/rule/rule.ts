import { DomainError } from '../error.js';
import type { CreateIntentInput } from '../execution/intent.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { Evidence } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import type { Condition } from '../state/condition.js';
import { assertConditionShape } from '../state/state.js';

export type RuleStatus = 'active' | 'paused' | 'stopped';
export type RuleTrigger =
  | {
      readonly operator: { readonly key: 'time'; readonly version: 1 };
      readonly at?: string;
      readonly afterMs?: number;
    }
  | { readonly operator: { readonly key: 'event'; readonly version: 1 }; readonly eventKey: string }
  | {
      readonly operator: { readonly key: 'stateChange'; readonly version: 1 };
      readonly itemIds?: readonly string[];
      readonly componentKeys?: readonly string[];
    };

export type IntentTemplate = Omit<
  CreateIntentInput,
  'id' | 'createdAt' | 'status' | 'proposer' | 'evidence'
>;
export interface RulePolicy {
  readonly repeatEveryMs?: number;
  readonly expiresAt?: string;
  readonly cooldownMs?: number;
  readonly maxOccurrences?: number;
  readonly stopWhen?: Condition;
  readonly priority?: number;
  readonly deduplication?: 'occurrence' | 'trigger' | 'none';
}
export interface CreateRuleInput {
  readonly id: string;
  readonly given: readonly Condition[];
  readonly when: RuleTrigger;
  readonly thenIntents: readonly IntentTemplate[];
  readonly policy?: RulePolicy;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status?: RuleStatus;
}

/** Closed declarative Given/When/Then contract that may only produce Intent templates. */
export class Rule {
  readonly id: string;
  readonly given: readonly Condition[];
  readonly when: RuleTrigger;
  readonly thenIntents: readonly IntentTemplate[];
  readonly policy: RulePolicy;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status: RuleStatus;
  private constructor(input: CreateRuleInput) {
    this.id = input.id;
    this.given = Object.freeze(structuredClone(input.given));
    this.when = Object.freeze(structuredClone(input.when));
    this.thenIntents = Object.freeze(structuredClone(input.thenIntents));
    this.policy = Object.freeze(structuredClone(input.policy ?? {}));
    this.evidence = Object.freeze(structuredClone(input.evidence));
    this.createdAt = input.createdAt;
    this.status = input.status ?? 'active';
    Object.freeze(this);
  }
  static create(input: CreateRuleInput): Rule {
    assertText(input.id, 'Rule id');
    assertUtcDateTime(input.createdAt, 'Rule createdAt');
    if (input.status && !['active', 'paused', 'stopped'].includes(input.status))
      throw new DomainError(`Rule status ${input.status} is invalid`);
    if (input.thenIntents.length === 0)
      throw new DomainError('Rule requires at least one Then Intent template');
    if (input.evidence.length === 0) throw new DomainError('Rule requires evidence');
    for (const condition of input.given) assertConditionShape(condition);
    validateTrigger(input.when);
    validatePolicy(input.policy ?? {});
    return new Rule(input);
  }
  pause(): Rule {
    if (this.status !== 'active')
      throw new DomainError(`Rule ${this.id} cannot pause from ${this.status}`);
    return new Rule({ ...this, status: 'paused' });
  }
  resume(): Rule {
    if (this.status !== 'paused')
      throw new DomainError(`Rule ${this.id} cannot resume from ${this.status}`);
    return new Rule({ ...this, status: 'active' });
  }
  stop(): Rule {
    return new Rule({ ...this, status: 'stopped' });
  }
}

function validateTrigger(trigger: RuleTrigger): void {
  assertRegistryKey(trigger.operator.key, 'Trigger operator key');
  assertVersion(trigger.operator.version, 'Trigger operator version');
  if (trigger.operator.key === 'time') {
    const time = trigger as Extract<RuleTrigger, { readonly operator: { readonly key: 'time' } }>;
    if ((time.at ? 1 : 0) + (time.afterMs === undefined ? 0 : 1) !== 1)
      throw new DomainError('Time trigger requires exactly one at or afterMs');
    if (time.at) assertUtcDateTime(time.at, 'Time trigger at');
    if (time.afterMs !== undefined && (!Number.isSafeInteger(time.afterMs) || time.afterMs < 0))
      throw new DomainError('Time trigger afterMs must be a non-negative integer');
  } else if (trigger.operator.key === 'event')
    assertRegistryKey(
      (trigger as Extract<RuleTrigger, { readonly operator: { readonly key: 'event' } }>).eventKey,
      'Event trigger key',
    );
  else {
    const stateChange = trigger as Extract<
      RuleTrigger,
      { readonly operator: { readonly key: 'stateChange' } }
    >;
    if ((stateChange.itemIds?.length ?? 0) + (stateChange.componentKeys?.length ?? 0) === 0)
      throw new DomainError('State-change trigger requires Item or Component dependencies');
  }
}

function validatePolicy(policy: RulePolicy): void {
  for (const [name, value] of [
    ['repeatEveryMs', policy.repeatEveryMs],
    ['cooldownMs', policy.cooldownMs],
    ['maxOccurrences', policy.maxOccurrences],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < (name === 'maxOccurrences' ? 1 : 0))
    )
      throw new DomainError(`Rule ${name} is invalid`);
  }
  if (policy.repeatEveryMs === 0) throw new DomainError('Rule repeatEveryMs must be positive');
  if (policy.expiresAt) assertUtcDateTime(policy.expiresAt, 'Rule expiresAt');
  if (policy.priority !== undefined && !Number.isSafeInteger(policy.priority))
    throw new DomainError('Rule priority must be an integer');
  if (policy.deduplication && !['occurrence', 'trigger', 'none'].includes(policy.deduplication))
    throw new DomainError(`Rule deduplication ${policy.deduplication} is invalid`);
  if (policy.stopWhen) assertConditionShape(policy.stopWhen);
}
