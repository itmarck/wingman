import { assertUtcDateTime } from '../../../core/knowledge/guard.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { InterpretationPublication } from '../ports.js';
import { emptyPublication, freezeDraft, freezePublication } from './freeze.js';
import type { InterpretationDraft, ResolutionDecision } from './input.js';
import {
  assertInterpretationIdentity,
  assertInterpretationState,
  assertInterpretationValue,
  assertInterpreterIdentity,
  type CreateInterpretationInput,
  type FailedInterpretationContext,
  type InterpretationId,
  type InterpretationState,
  type InterpretationStatus,
  type InterpreterIdentity,
  type RehydrateInterpretationInput,
} from './interpretation-state.js';

export type {
  CreateInterpretationInput,
  FailedInterpretationContext,
  InterpretationId,
  InterpretationState,
  InterpretationStatus,
  InterpreterIdentity,
  RehydrateInterpretationInput,
} from './interpretation-state.js';

/**
 * Preserves one historical effort and its attempts to derive knowledge from an Entry.
 */
export class Interpretation {
  readonly id: InterpretationId;
  readonly entryId: string;
  readonly status: InterpretationStatus;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly availableAt?: string;
  readonly interpreter?: InterpreterIdentity;
  readonly draft?: InterpretationDraft;
  readonly publication?: InterpretationPublication;
  readonly error?: string;

  private constructor(input: CreateInterpretationInput, state: InterpretationState) {
    this.id = input.id;
    this.entryId = input.entryId;
    this.createdAt = input.createdAt;
    this.status = state.status;
    this.attempts = state.attempts;
    this.updatedAt = state.updatedAt;
    this.availableAt = state.availableAt;
    this.interpreter = state.interpreter ? Object.freeze({ ...state.interpreter }) : undefined;
    this.draft = state.draft ? freezeDraft(state.draft) : undefined;
    this.publication = state.publication ? freezePublication(state.publication) : undefined;
    this.error = state.error;

    Object.freeze(this);
  }

  static create(input: CreateInterpretationInput): Interpretation {
    assertInterpretationIdentity(input);

    return new Interpretation(input, {
      status: 'queued',
      attempts: 0,
      updatedAt: input.createdAt,
      availableAt: input.createdAt,
    });
  }

  /**
   * Reconstructs an Interpretation exactly as persisted while checking essential invariants.
   */
  static rehydrate(input: RehydrateInterpretationInput): Interpretation {
    assertInterpretationIdentity(input);
    assertInterpretationState(input);

    return new Interpretation(input, input);
  }

  start(startedAt: string): Interpretation {
    if (this.status !== 'queued') {
      throw new ConflictError(`Interpretation ${this.id} cannot start from ${this.status}`);
    }

    assertUtcDateTime(startedAt, 'Interpretation startedAt');

    return this.change({
      status: 'processing',
      attempts: this.attempts + 1,
      updatedAt: startedAt,
    });
  }

  recover(startedAt: string): Interpretation {
    if (this.status !== 'processing') {
      throw new ConflictError(`Interpretation ${this.id} cannot recover from ${this.status}`);
    }

    assertUtcDateTime(startedAt, 'Interpretation recoveredAt');

    return this.change({
      status: 'processing',
      attempts: this.attempts + 1,
      updatedAt: startedAt,
    });
  }

  requestReview(
    draft: InterpretationDraft,
    interpreter: InterpreterIdentity,
    requestedAt: string,
  ): Interpretation {
    return this.finishProcessing('pending', interpreter, requestedAt, draft);
  }

  completeKnowledge(
    draft: InterpretationDraft,
    interpreter: InterpreterIdentity,
    publication: InterpretationPublication,
    completedAt: string,
  ): Interpretation {
    return this.finishProcessing('completed', interpreter, completedAt, draft, publication);
  }

  completeEmpty(interpreter: InterpreterIdentity, completedAt: string): Interpretation {
    return this.finishProcessing(
      'completed',
      interpreter,
      completedAt,
      undefined,
      emptyPublication,
    );
  }

  completeReview(
    decisions: readonly ResolutionDecision[],
    publication: InterpretationPublication,
    completedAt: string,
  ): Interpretation {
    if (this.status !== 'pending' || !this.draft || !this.interpreter) {
      throw new ConflictError(`Interpretation ${this.id} has no completed Review`);
    }

    assertUtcDateTime(completedAt, 'Interpretation completedAt');

    return this.change({
      status: 'completed',
      attempts: this.attempts,
      updatedAt: completedAt,
      draft: {
        ...this.draft,
        decisions,
      },
      interpreter: this.interpreter,
      publication,
    });
  }

  fail(error: string, failedAt: string, context?: FailedInterpretationContext): Interpretation {
    this.assertProcessingFailure(error, failedAt, context);

    return this.change({
      status: 'failed',
      attempts: this.attempts,
      updatedAt: failedAt,
      interpreter: context?.interpreter,
      draft: context?.draft,
      error,
    });
  }

  reschedule(
    error: string,
    failedAt: string,
    availableAt: string,
    context?: FailedInterpretationContext,
  ): Interpretation {
    this.assertProcessingFailure(error, failedAt, context);
    assertUtcDateTime(availableAt, 'Interpretation availableAt');

    return this.change({
      status: 'queued',
      attempts: this.attempts,
      updatedAt: failedAt,
      availableAt,
      interpreter: context?.interpreter,
      draft: context?.draft,
      error,
    });
  }

  exhaust(
    error: string,
    exhaustedAt: string,
    context?: FailedInterpretationContext,
  ): Interpretation {
    this.assertProcessingFailure(error, exhaustedAt, context);

    return this.change({
      status: 'exhausted',
      attempts: this.attempts,
      updatedAt: exhaustedAt,
      interpreter: context?.interpreter,
      draft: context?.draft,
      error,
    });
  }

  retry(queuedAt: string): Interpretation {
    const retryableStatuses: readonly InterpretationStatus[] = ['exhausted', 'failed'];

    if (!retryableStatuses.includes(this.status)) {
      throw new ConflictError(`Interpretation ${this.id} cannot retry from ${this.status}`);
    }

    assertUtcDateTime(queuedAt, 'Interpretation queuedAt');

    return this.change({
      status: 'queued',
      attempts: this.attempts,
      updatedAt: queuedAt,
      availableAt: queuedAt,
    });
  }

  private assertProcessingFailure(
    error: string,
    failedAt: string,
    context?: FailedInterpretationContext,
  ): void {
    if (this.status !== 'processing') {
      throw new ConflictError(`Interpretation ${this.id} cannot fail from ${this.status}`);
    }

    assertInterpretationValue(error, 'Interpretation error');
    assertUtcDateTime(failedAt, 'Interpretation failedAt');

    if (context?.draft && context.draft.entryId !== this.entryId) {
      throw new InvalidInputError('Interpretation draft has a different Entry identity');
    }

    if (context) {
      assertInterpreterIdentity(context.interpreter);
    }
  }

  private finishProcessing(
    status: Extract<InterpretationStatus, 'completed' | 'pending'>,
    interpreter: InterpreterIdentity,
    updatedAt: string,
    draft?: InterpretationDraft,
    publication?: InterpretationPublication,
  ): Interpretation {
    if (this.status !== 'processing') {
      throw new ConflictError(`Interpretation ${this.id} cannot finish from ${this.status}`);
    }

    if (draft && draft.entryId !== this.entryId) {
      throw new InvalidInputError('Interpretation draft has a different Entry identity');
    }

    assertInterpreterIdentity(interpreter);
    assertUtcDateTime(updatedAt, 'Interpretation updatedAt');

    return this.change({
      status,
      attempts: this.attempts,
      updatedAt,
      interpreter,
      draft,
      publication,
    });
  }

  private change(state: InterpretationState): Interpretation {
    return new Interpretation(
      {
        id: this.id,
        entryId: this.entryId,
        createdAt: this.createdAt,
      },
      state,
    );
  }
}
