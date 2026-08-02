import { DomainError } from '../error.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { Evidence, ValidTime } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import { normalizeSourceLocators } from '../knowledge/source.js';
import type { Condition } from './condition.js';

export const modalities = ['observed', 'believed', 'desired', 'required', 'forbidden', 'predicted'] as const;
export type Modality = (typeof modalities)[number];

export interface StateAuthor { readonly kind: 'user' | 'system' | 'inference'; readonly id?: string }

export interface CreateStateInput {
  readonly id: string;
  readonly modality: Modality;
  readonly condition: Condition;
  readonly author: StateAuthor;
  readonly evidence: readonly Evidence[];
  readonly recordedAt: string;
  readonly validTime?: ValidTime;
  readonly confidence?: number;
}

/** Non-derivable modal meaning preserved independently from observed Item structure. */
export class State {
  readonly id: string;
  readonly modality: Modality;
  readonly condition: Condition;
  readonly author: StateAuthor;
  readonly evidence: readonly Evidence[];
  readonly recordedAt: string;
  readonly validTime?: ValidTime;
  readonly confidence?: number;

  private constructor(input: CreateStateInput) {
    this.id = input.id;
    this.modality = input.modality;
    this.condition = freezeCondition(input.condition);
    this.author = Object.freeze({ ...input.author });
    this.evidence = Object.freeze(input.evidence.map((value) => Object.freeze({ entryId: value.entryId, sourceLocators: normalizeSourceLocators(value.sourceLocators) })));
    this.recordedAt = input.recordedAt;
    this.validTime = input.validTime ? Object.freeze({ ...input.validTime }) : undefined;
    this.confidence = input.confidence;
    Object.freeze(this);
  }

  static create(input: CreateStateInput): State {
    assertText(input.id, 'State id');
    if (!modalities.includes(input.modality)) throw new DomainError(`State modality ${input.modality} is invalid`);
    assertUtcDateTime(input.recordedAt, 'State recordedAt');
    assertText(input.author.kind, 'State author kind');
    if (input.evidence.length === 0) throw new DomainError('Persisted State requires evidence');
    for (const evidence of input.evidence) assertText(evidence.entryId, 'State evidence entryId');
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) throw new DomainError('State confidence must be between 0 and 1');
    if (input.validTime?.from) assertUtcDateTime(input.validTime.from, 'State validTime.from');
    if (input.validTime?.to) assertUtcDateTime(input.validTime.to, 'State validTime.to');
    if (input.validTime?.from && input.validTime.to && Date.parse(input.validTime.from) >= Date.parse(input.validTime.to)) throw new DomainError('State validTime.from must precede validTime.to');
    assertConditionShape(input.condition);
    return new State(input);
  }

  static rehydrate(input: CreateStateInput): State { return State.create(input); }
}

export function assertConditionShape(condition: Condition): void {
  assertRegistryKey(condition.operator.key, 'Condition operator key');
  assertVersion(condition.operator.version, 'Condition operator version');
  if (!Array.isArray(condition.operands)) throw new DomainError('Condition operands must be an array');
  for (const operand of condition.operands) {
    if ('operator' in operand) assertConditionShape(operand);
    else if (operand.kind === 'component') { assertText(operand.itemId, 'Condition Component itemId'); assertRegistryKey(operand.key, 'Condition Component key'); }
  }
}

function freezeCondition(condition: Condition): Condition {
  return Object.freeze({ operator: Object.freeze({ ...condition.operator }), operands: Object.freeze(condition.operands.map((operand) => 'operator' in operand ? freezeCondition(operand) : Object.freeze(structuredClone(operand)))) });
}
