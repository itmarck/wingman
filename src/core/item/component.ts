import { DomainError } from '../error.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import { normalizeSourceLocators } from '../knowledge/source.js';
import { assertRegistryKey, assertVersion } from './item.js';
import type {
  CandidateStatus,
  ComponentRevisionId,
  ComponentValue,
  Evidence,
  ItemId,
  ValidTime,
} from './types.js';

export type { ComponentRevisionId } from './types.js';

export interface CreateComponentRevisionInput {
  readonly id: ComponentRevisionId;
  readonly itemId: ItemId;
  readonly key: string;
  readonly schemaVersion: number;
  readonly value: ComponentValue;
  readonly evidence: readonly Evidence[];
  readonly recordedAt: string;
  readonly validTime?: ValidTime;
  readonly status?: CandidateStatus;
  readonly supersedesRevisionId?: ComponentRevisionId;
}

/** Immutable evidence-backed revision of one Component on an Item. */
export class ComponentRevision {
  readonly id: ComponentRevisionId;
  readonly itemId: ItemId;
  readonly key: string;
  readonly schemaVersion: number;
  readonly value: ComponentValue;
  readonly evidence: readonly Evidence[];
  readonly recordedAt: string;
  readonly validTime?: ValidTime;
  readonly status: CandidateStatus;
  readonly supersedesRevisionId?: ComponentRevisionId;

  private constructor(input: CreateComponentRevisionInput) {
    this.id = input.id;
    this.itemId = input.itemId;
    this.key = input.key;
    this.schemaVersion = input.schemaVersion;
    this.value = deepFreeze(structuredClone(input.value));
    this.evidence = Object.freeze(
      input.evidence.map((evidence) =>
        Object.freeze({
          entryId: evidence.entryId,
          sourceLocators: normalizeSourceLocators(evidence.sourceLocators),
        }),
      ),
    );
    this.recordedAt = input.recordedAt;
    this.validTime = input.validTime ? Object.freeze({ ...input.validTime }) : undefined;
    this.status = input.status ?? 'accepted';
    this.supersedesRevisionId = input.supersedesRevisionId;
    Object.freeze(this);
  }

  static create(input: CreateComponentRevisionInput): ComponentRevision {
    assertText(input.id, 'Component revision id');
    assertText(input.itemId, 'Component revision itemId');
    assertRegistryKey(input.key, 'Component key');
    assertVersion(input.schemaVersion, 'Component schemaVersion');
    assertUtcDateTime(input.recordedAt, 'Component recordedAt');
    assertValidTime(input.validTime);

    if (input.evidence.length === 0) {
      throw new DomainError('Component revision requires evidence');
    }

    for (const evidence of input.evidence) {
      assertText(evidence.entryId, 'Component evidence entryId');
    }

    if (input.supersedesRevisionId === input.id) {
      throw new DomainError('Component revision cannot supersede itself');
    }

    return new ComponentRevision(input);
  }

  static rehydrate(input: CreateComponentRevisionInput): ComponentRevision {
    return ComponentRevision.create(input);
  }
}

function assertValidTime(validTime?: ValidTime): void {
  if (!validTime) return;
  if (validTime.from) assertUtcDateTime(validTime.from, 'Component validTime.from');
  if (validTime.to) assertUtcDateTime(validTime.to, 'Component validTime.to');
  if (validTime.from && validTime.to && Date.parse(validTime.from) >= Date.parse(validTime.to)) {
    throw new DomainError('Component validTime.from must precede validTime.to');
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
