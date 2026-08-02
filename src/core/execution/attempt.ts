import type { ComponentValue } from '../item/types.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';

export type AttemptOutcome = 'started' | 'succeeded' | 'failed' | 'uncertain';
export interface CreateAttemptInput {
  readonly id: string;
  readonly intentId: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly outcome?: AttemptOutcome;
  readonly output?: ComponentValue;
  readonly message?: string;
}

/** Immutable record of one actual Capability invocation. */
export class Attempt {
  readonly id: string;
  readonly intentId: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly outcome: AttemptOutcome;
  readonly output?: ComponentValue;
  readonly message?: string;
  private constructor(input: CreateAttemptInput) {
    this.id = input.id;
    this.intentId = input.intentId;
    this.sequence = input.sequence;
    this.idempotencyKey = input.idempotencyKey;
    this.startedAt = input.startedAt;
    this.finishedAt = input.finishedAt;
    this.output = input.output === undefined ? undefined : structuredClone(input.output);
    this.message = input.message;
    this.outcome = input.outcome ?? 'started';
    Object.freeze(this);
  }
  static create(input: CreateAttemptInput): Attempt {
    assertText(input.id, 'Attempt id');
    assertText(input.intentId, 'Attempt intentId');
    assertText(input.idempotencyKey, 'Attempt idempotencyKey');
    assertUtcDateTime(input.startedAt, 'Attempt startedAt');
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 1)
      throw new Error('Attempt sequence must be positive');
    return new Attempt(input);
  }
  finish(
    outcome: Exclude<AttemptOutcome, 'started'>,
    finishedAt: string,
    output?: ComponentValue,
    message?: string,
  ): Attempt {
    assertUtcDateTime(finishedAt, 'Attempt finishedAt');
    return new Attempt({ ...this, outcome, finishedAt, output, message });
  }
}
