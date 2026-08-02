import { assertRegistryKey } from '../item/item.js';
import type { ComponentValue } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';

export interface CreateEventInput {
  readonly id: string;
  readonly key: string;
  readonly occurredAt: string;
  readonly causation: {
    readonly intentId?: string;
    readonly attemptId?: string;
    readonly entryId?: string;
  };
  readonly data: ComponentValue;
}
/** Immutable occurrence or outcome evidence, distinct from its Entry and Attempt causation. */
export class Event {
  readonly id: string;
  readonly key: string;
  readonly occurredAt: string;
  readonly causation: CreateEventInput['causation'];
  readonly data: ComponentValue;
  private constructor(input: CreateEventInput) {
    this.id = input.id;
    this.key = input.key;
    this.occurredAt = input.occurredAt;
    this.causation = Object.freeze({ ...input.causation });
    this.data = structuredClone(input.data);
    Object.freeze(this);
  }
  static create(input: CreateEventInput): Event {
    assertText(input.id, 'Event id');
    assertRegistryKey(input.key, 'Event key');
    assertUtcDateTime(input.occurredAt, 'Event occurredAt');
    if (!input.causation.intentId && !input.causation.attemptId && !input.causation.entryId)
      throw new Error('Event requires causation');
    return new Event(input);
  }
}
