import { assertUtcDateTime } from '../../../core/knowledge/guard.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { InterpretationPublication } from '../ports/store.js';
import type { ReferenceDecision, RegisterInterpretationInput } from './input.js';

export type InterpretationId = string;
export type InterpretationStatus =
  | 'completed'
  | 'exhausted'
  | 'failed'
  | 'pending'
  | 'processing'
  | 'queued';

export interface InterpreterIdentity {
  readonly key: string;
}

export interface InterpretationState {
  readonly status: InterpretationStatus;
  readonly attempts: number;
  readonly updatedAt: string;
  readonly availableAt?: string;
  readonly interpreter?: InterpreterIdentity;
  readonly draft?: RegisterInterpretationInput;
  readonly publication?: InterpretationPublication;
  readonly error?: string;
}

export interface CreateInterpretationInput {
  readonly id: InterpretationId;
  readonly entryId: string;
  readonly createdAt: string;
}

export interface RehydrateInterpretationInput
  extends CreateInterpretationInput,
    InterpretationState {}

export interface FailedInterpretationContext {
  readonly interpreter: InterpreterIdentity;
  readonly draft?: RegisterInterpretationInput;
}

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
  readonly draft?: RegisterInterpretationInput;
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
    assertIdentity(input);

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
    assertIdentity(input);
    assertState(input);

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
    draft: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    requestedAt: string,
  ): Interpretation {
    return this.finishProcessing('pending', interpreter, requestedAt, draft);
  }

  completeKnowledge(
    draft: RegisterInterpretationInput,
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
    decisions: readonly ReferenceDecision[],
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
        referenceDecisions: decisions,
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

    assertValue(error, 'Interpretation error');
    assertUtcDateTime(failedAt, 'Interpretation failedAt');

    if (context?.draft && context.draft.entryId !== this.entryId) {
      throw new InvalidInputError('Interpretation draft has a different Entry identity');
    }

    if (context) {
      assertInterpreter(context.interpreter);
    }
  }

  private finishProcessing(
    status: Extract<InterpretationStatus, 'completed' | 'pending'>,
    interpreter: InterpreterIdentity,
    updatedAt: string,
    draft?: RegisterInterpretationInput,
    publication?: InterpretationPublication,
  ): Interpretation {
    if (this.status !== 'processing') {
      throw new ConflictError(`Interpretation ${this.id} cannot finish from ${this.status}`);
    }

    if (draft && draft.entryId !== this.entryId) {
      throw new InvalidInputError('Interpretation draft has a different Entry identity');
    }

    assertInterpreter(interpreter);
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

const emptyPublication: InterpretationPublication = Object.freeze({
  itemIds: Object.freeze([]),
  revisionIds: Object.freeze([]),
});

function assertIdentity(input: CreateInterpretationInput): void {
  assertValue(input.id, 'Interpretation id');
  assertValue(input.entryId, 'Interpretation entryId');
  assertUtcDateTime(input.createdAt, 'Interpretation createdAt');
}

function assertState(state: RehydrateInterpretationInput): void {
  const statuses: readonly InterpretationStatus[] = [
    'queued',
    'processing',
    'pending',
    'completed',
    'failed',
    'exhausted',
  ];

  if (!statuses.includes(state.status)) {
    throw new InvalidInputError(`Interpretation status ${state.status} is invalid`);
  }

  if (!Number.isInteger(state.attempts) || state.attempts < 0) {
    throw new InvalidInputError('Interpretation attempts must be a non-negative integer');
  }

  assertUtcDateTime(state.updatedAt, 'Interpretation updatedAt');

  if (Date.parse(state.updatedAt) < Date.parse(state.createdAt)) {
    throw new InvalidInputError('Interpretation updatedAt cannot precede createdAt');
  }

  if (state.availableAt) {
    assertUtcDateTime(state.availableAt, 'Interpretation availableAt');
  }

  if (state.interpreter) {
    assertInterpreter(state.interpreter);
  }

  const requiresAttempt = state.status !== 'queued' || state.attempts > 0;
  const terminalFailure = ['failed', 'exhausted'].includes(state.status);

  if (requiresAttempt && state.attempts === 0) {
    throw new InvalidInputError(`Interpretation ${state.status} requires at least one attempt`);
  }

  if (state.status === 'pending' && (!state.draft || !state.interpreter)) {
    throw new InvalidInputError('Pending Interpretation requires a Draft and Interpreter');
  }

  if (state.status === 'completed' && (!state.publication || !state.interpreter)) {
    throw new InvalidInputError('Completed Interpretation requires a publication and Interpreter');
  }

  if (terminalFailure && !state.error) {
    throw new InvalidInputError(`${state.status} Interpretation requires an error`);
  }

  if (state.status === 'queued' && !state.availableAt) {
    throw new InvalidInputError('Queued Interpretation requires availableAt');
  }

  if (state.status !== 'queued' && state.availableAt) {
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain availableAt`);
  }

  const allowsPublication = state.status === 'completed';
  const allowsError = state.status === 'queued' || terminalFailure;
  const allowsDraft = ['completed', 'exhausted', 'failed', 'pending', 'queued'].includes(
    state.status,
  );

  if (!allowsPublication && state.publication) {
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain a publication`);
  }

  if (!allowsError && state.error) {
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain an error`);
  }

  if (!allowsDraft && state.draft) {
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain a Draft`);
  }
}

function freezePublication(publication: InterpretationPublication): InterpretationPublication {
  return Object.freeze({
    itemIds: Object.freeze([...publication.itemIds]),
    revisionIds: Object.freeze([...publication.revisionIds]),
  });
}

function assertInterpreter(identity: InterpreterIdentity): void {
  assertValue(identity.key, 'Interpreter key');
}

function assertValue(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new InvalidInputError(`${name} cannot be empty`);
  }
}

function freezeDraft(draft: RegisterInterpretationInput): RegisterInterpretationInput {
  return Object.freeze({
    ...draft,
    items: Object.freeze(
      draft.items.map((item) =>
        Object.freeze({
          ...item,
          profile: item.profile ? Object.freeze({ ...item.profile }) : undefined,
        }),
      ),
    ),
    components: Object.freeze(
      draft.components.map((component) =>
        Object.freeze({
          ...component,
          value: structuredClone(component.value),
          validTime: component.validTime ? Object.freeze({ ...component.validTime }) : undefined,
          sourceLocators: component.sourceLocators
            ? Object.freeze(
                component.sourceLocators.map((locator) => Object.freeze({ ...locator })),
              )
            : undefined,
        }),
      ),
    ),
    referenceResolutions: draft.referenceResolutions
      ? Object.freeze(
          draft.referenceResolutions.map((resolution) =>
            Object.freeze({
              ...resolution,
              candidateItemIds: Object.freeze([...resolution.candidateItemIds]),
            }),
          ),
        )
      : undefined,
    referenceDecisions: draft.referenceDecisions
      ? Object.freeze(draft.referenceDecisions.map((decision) => Object.freeze({ ...decision })))
      : undefined,
    workflows: Object.freeze(structuredClone(draft.workflows ?? [])),
  });
}
