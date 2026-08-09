import { DomainError } from '../error.js';
import type { CreateIntentInput } from '../execution/intent.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { Evidence, ItemReference } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import type { Condition } from '../state/condition.js';
import { assertConditionShape } from '../state/state.js';

export type AutomationStatus = 'active' | 'paused' | 'stopped';
export type AutomationTrigger =
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
    }
  | {
      readonly operator: { readonly key: 'schedule'; readonly version: 1 };
      readonly occurrences: readonly string[];
    };

export type IntentTemplate = Omit<
  CreateIntentInput,
  'id' | 'createdAt' | 'status' | 'proposer' | 'evidence'
>;
export interface AutomationControls {
  readonly repeatEveryMs?: number;
  readonly expiresAt?: string;
  readonly cooldownMs?: number;
  readonly maxOccurrences?: number;
  readonly stopWhen?: Condition;
  readonly priority?: number;
  readonly deduplication?: 'occurrence' | 'trigger' | 'none';
}
export interface CreateAutomationInput {
  readonly id: string;
  readonly given: readonly Condition[];
  readonly when: AutomationTrigger;
  readonly subjects?: readonly ItemReference[];
  readonly thenIntents: readonly IntentTemplate[];
  readonly controls?: AutomationControls;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status?: AutomationStatus;
}

/** Closed declarative Given/When/Then contract that may only produce Intent templates. */
export class Automation {
  readonly id: string;
  readonly given: readonly Condition[];
  readonly when: AutomationTrigger;
  readonly subjects: readonly ItemReference[];
  readonly thenIntents: readonly IntentTemplate[];
  readonly controls: AutomationControls;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status: AutomationStatus;
  private constructor(input: CreateAutomationInput) {
    this.id = input.id;
    this.given = Object.freeze(structuredClone(input.given));
    this.when = Object.freeze(structuredClone(input.when));
    this.subjects = Object.freeze(structuredClone(input.subjects ?? []));
    this.thenIntents = Object.freeze(structuredClone(input.thenIntents));
    this.controls = Object.freeze(structuredClone(input.controls ?? {}));
    this.evidence = Object.freeze(structuredClone(input.evidence));
    this.createdAt = input.createdAt;
    this.status = input.status ?? 'active';
    Object.freeze(this);
  }
  static create(input: CreateAutomationInput): Automation {
    assertText(input.id, 'Automation id');
    assertUtcDateTime(input.createdAt, 'Automation createdAt');
    if (input.status && !['active', 'paused', 'stopped'].includes(input.status))
      throw new DomainError(`Automation status ${input.status} is invalid`);
    if (input.thenIntents.length === 0)
      throw new DomainError('Automation requires at least one Then Intent template');
    if (input.evidence.length === 0) throw new DomainError('Automation requires evidence');
    for (const condition of input.given) assertConditionShape(condition);
    validateAutomationTrigger(input.when);
    for (const subject of input.subjects ?? []) {
      if (subject.kind !== 'itemReference') throw new DomainError('Automation subject is invalid');
      assertText(subject.itemId, 'Automation subject Item id');
    }
    validateControls(input.controls ?? {});
    return new Automation(input);
  }
  pause(): Automation {
    if (this.status !== 'active')
      throw new DomainError(`Automation ${this.id} cannot pause from ${this.status}`);
    return new Automation({ ...this, status: 'paused' });
  }
  resume(): Automation {
    if (this.status !== 'paused')
      throw new DomainError(`Automation ${this.id} cannot resume from ${this.status}`);
    return new Automation({ ...this, status: 'active' });
  }
  stop(): Automation {
    return new Automation({ ...this, status: 'stopped' });
  }
  reschedule(occurrences: readonly string[], expiresAt?: string): Automation {
    return Automation.create({
      ...this,
      when: { operator: { key: 'schedule', version: 1 }, occurrences },
      controls: { ...this.controls, expiresAt },
      status: 'active',
    });
  }
}

export function validateAutomationTrigger(trigger: AutomationTrigger): void {
  assertRegistryKey(trigger.operator.key, 'Trigger operator key');
  assertVersion(trigger.operator.version, 'Trigger operator version');
  if (trigger.operator.key === 'time') {
    const time = trigger as Extract<
      AutomationTrigger,
      { readonly operator: { readonly key: 'time' } }
    >;
    if ((time.at ? 1 : 0) + (time.afterMs === undefined ? 0 : 1) !== 1)
      throw new DomainError('Time trigger requires exactly one at or afterMs');
    if (time.at) assertUtcDateTime(time.at, 'Time trigger at');
    if (time.afterMs !== undefined && (!Number.isSafeInteger(time.afterMs) || time.afterMs < 0))
      throw new DomainError('Time trigger afterMs must be a non-negative integer');
  } else if (trigger.operator.key === 'event')
    assertRegistryKey(
      (trigger as Extract<AutomationTrigger, { readonly operator: { readonly key: 'event' } }>)
        .eventKey,
      'Event trigger key',
    );
  else if (trigger.operator.key === 'stateChange') {
    const stateChange = trigger as Extract<
      AutomationTrigger,
      { readonly operator: { readonly key: 'stateChange' } }
    >;
    if ((stateChange.itemIds?.length ?? 0) + (stateChange.componentKeys?.length ?? 0) === 0)
      throw new DomainError('State-change trigger requires Item or Component dependencies');
  } else {
    const schedule = trigger as Extract<
      AutomationTrigger,
      { readonly operator: { readonly key: 'schedule' } }
    >;
    if (schedule.occurrences.length === 0)
      throw new DomainError('Schedule trigger requires occurrences');
    for (const occurrence of schedule.occurrences)
      assertUtcDateTime(occurrence, 'Schedule trigger occurrence');
    if (new Set(schedule.occurrences).size !== schedule.occurrences.length)
      throw new DomainError('Schedule trigger occurrences must be unique');
    if (
      schedule.occurrences.some(
        (value, index) => index > 0 && value <= (schedule.occurrences.at(index - 1) ?? value),
      )
    )
      throw new DomainError('Schedule trigger occurrences must be ordered');
  }
}

function validateControls(controls: AutomationControls): void {
  for (const [name, value] of [
    ['repeatEveryMs', controls.repeatEveryMs],
    ['cooldownMs', controls.cooldownMs],
    ['maxOccurrences', controls.maxOccurrences],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < (name === 'maxOccurrences' ? 1 : 0))
    )
      throw new DomainError(`Automation ${name} is invalid`);
  }
  if (controls.repeatEveryMs === 0)
    throw new DomainError('Automation repeatEveryMs must be positive');
  if (controls.expiresAt) assertUtcDateTime(controls.expiresAt, 'Automation expiresAt');
  if (controls.priority !== undefined && !Number.isSafeInteger(controls.priority))
    throw new DomainError('Automation priority must be an integer');
  if (controls.deduplication && !['occurrence', 'trigger', 'none'].includes(controls.deduplication))
    throw new DomainError(`Automation deduplication ${controls.deduplication} is invalid`);
  if (controls.stopWhen) assertConditionShape(controls.stopWhen);
}
