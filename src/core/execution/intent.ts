import { DomainError } from '../error.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { ComponentValue, Evidence } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import type { Condition } from '../state/condition.js';
import { assertConditionShape } from '../state/state.js';

export type IntentStatus = 'proposed' | 'consented' | 'cancelled' | 'completed';
export interface IntentProposer {
  readonly kind: 'user' | 'system' | 'automation';
  readonly id?: string;
}
export interface IntentTrigger {
  readonly kind: 'manual' | 'time' | 'event';
  readonly value?: string;
}
export interface CreateIntentInput {
  readonly id: string;
  readonly capability: { readonly key: string; readonly version: number };
  readonly input: ComponentValue;
  readonly proposer: IntentProposer;
  readonly conditions: readonly Condition[];
  readonly expectedState: readonly Condition[];
  readonly consent: 'none' | 'explicit';
  readonly trigger?: IntentTrigger;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status?: IntentStatus;
}

/** Immutable conditional proposal to invoke one registered Capability. */
export class Intent {
  readonly id: string;
  readonly capability: CreateIntentInput['capability'];
  readonly input: ComponentValue;
  readonly proposer: IntentProposer;
  readonly conditions: readonly Condition[];
  readonly expectedState: readonly Condition[];
  readonly consent: 'none' | 'explicit';
  readonly trigger?: IntentTrigger;
  readonly evidence: readonly Evidence[];
  readonly createdAt: string;
  readonly status: IntentStatus;
  private constructor(input: CreateIntentInput) {
    this.id = input.id;
    this.capability = Object.freeze({ ...input.capability });
    this.input = structuredClone(input.input);
    this.proposer = Object.freeze({ ...input.proposer });
    this.conditions = Object.freeze([...input.conditions]);
    this.expectedState = Object.freeze([...input.expectedState]);
    this.consent = input.consent;
    this.trigger = input.trigger ? Object.freeze({ ...input.trigger }) : undefined;
    this.evidence = Object.freeze(
      input.evidence.map((value) =>
        Object.freeze({ ...value, sourceLocators: Object.freeze([...value.sourceLocators]) }),
      ),
    );
    this.createdAt = input.createdAt;
    this.status = input.status ?? 'proposed';
    Object.freeze(this);
  }
  static create(input: CreateIntentInput): Intent {
    assertText(input.id, 'Intent id');
    assertRegistryKey(input.capability.key, 'Capability key');
    assertVersion(input.capability.version, 'Capability version');
    assertUtcDateTime(input.createdAt, 'Intent createdAt');
    if (input.evidence.length === 0) throw new DomainError('Intent requires evidence');
    for (const condition of [...input.conditions, ...input.expectedState])
      assertConditionShape(condition);
    return new Intent(input);
  }
  grantConsent(): Intent {
    if (this.status !== 'proposed')
      throw new DomainError(`Intent ${this.id} cannot receive consent from ${this.status}`);
    if (this.consent !== 'explicit')
      throw new DomainError(`Intent ${this.id} does not require explicit consent`);
    return new Intent({ ...this, status: 'consented' });
  }
  cancel(): Intent {
    if (['cancelled', 'completed'].includes(this.status))
      throw new DomainError(`Intent ${this.id} cannot be cancelled from ${this.status}`);
    return new Intent({ ...this, status: 'cancelled' });
  }
  complete(): Intent {
    if (this.status !== 'consented' && !(this.status === 'proposed' && this.consent === 'none'))
      throw new DomainError(`Intent ${this.id} cannot complete from ${this.status}`);
    return new Intent({ ...this, status: 'completed' });
  }
}
