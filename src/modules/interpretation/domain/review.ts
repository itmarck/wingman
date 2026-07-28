import type { ConceptId } from '../../../core/knowledge/concept.js';
import { assertText, assertUtcDateTime } from '../../../core/knowledge/guard.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { ConceptDecision, InterpretationConcept } from './input.js';
import type { InterpretationId } from './interpretation.js';

export type ReviewId = string;
export type ReviewKind = 'ambiguousConcept';
export type ReviewStatus = 'pending' | 'resolved';

export interface ConceptCandidate {
  readonly id: ConceptId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly definition: string;
}

export interface ConceptAmbiguity {
  readonly reference: string;
  readonly proposed: InterpretationConcept;
  readonly candidates: readonly ConceptCandidate[];
}

export interface CreateInterpretationReviewInput {
  readonly id: ReviewId;
  readonly interpretationId: InterpretationId;
  readonly entryId: string;
  readonly ambiguity: ConceptAmbiguity;
  readonly createdAt: string;
}

export interface ReviewState {
  readonly status: ReviewStatus;
  readonly decision?: ConceptDecision;
  readonly resolvedAt?: string;
}

export interface RehydrateReviewInput extends CreateInterpretationReviewInput, ReviewState {
  readonly kind: ReviewKind;
}

/**
 * Durable request for one human decision that blocks an Interpretation.
 */
export class Review {
  readonly id: ReviewId;
  readonly kind: ReviewKind;
  readonly status: ReviewStatus;
  readonly interpretationId: InterpretationId;
  readonly entryId: string;
  readonly ambiguity: ConceptAmbiguity;
  readonly createdAt: string;
  readonly decision?: ConceptDecision;
  readonly resolvedAt?: string;

  private constructor(input: CreateInterpretationReviewInput, state: ReviewState) {
    this.id = input.id;
    this.kind = 'ambiguousConcept';
    this.status = state.status;
    this.interpretationId = input.interpretationId;
    this.entryId = input.entryId;
    this.ambiguity = input.ambiguity;
    this.createdAt = input.createdAt;
    this.decision = state.decision;
    this.resolvedAt = state.resolvedAt;

    Object.freeze(this);
  }

  static createInterpretation(input: CreateInterpretationReviewInput): Review {
    assertIdentity(input);

    return new Review(
      {
        ...input,
        ambiguity: freezeAmbiguity(input.ambiguity),
      },
      {
        status: 'pending',
      },
    );
  }

  /**
   * Reconstructs a Review exactly as persisted while checking its state invariants.
   */
  static rehydrate(input: RehydrateReviewInput): Review {
    assertIdentity(input);

    if (input.kind !== 'ambiguousConcept') {
      throw new InvalidInputError(`Review kind ${input.kind} is invalid`);
    }

    const statuses: readonly ReviewStatus[] = ['pending', 'resolved'];

    if (!statuses.includes(input.status)) {
      throw new InvalidInputError(`Review status ${input.status} is invalid`);
    }

    const hasResolution = input.decision !== undefined && input.resolvedAt !== undefined;

    if (input.status === 'resolved' && !hasResolution) {
      throw new InvalidInputError('Resolved Review requires a decision and resolvedAt');
    }

    if (input.status === 'pending' && (input.decision || input.resolvedAt)) {
      throw new InvalidInputError('Pending Review cannot contain a resolution');
    }

    if (input.decision) {
      if (input.decision.reference !== input.ambiguity.reference) {
        throw new InvalidInputError('Review decision must resolve its ambiguity');
      }

      assertSelectedCandidate(input.ambiguity, input.decision);
    }

    if (input.resolvedAt) {
      assertUtcDateTime(input.resolvedAt, 'Review resolvedAt');

      if (Date.parse(input.resolvedAt) < Date.parse(input.createdAt)) {
        throw new InvalidInputError('Review resolvedAt cannot precede createdAt');
      }
    }

    return new Review(
      {
        ...input,
        ambiguity: freezeAmbiguity(input.ambiguity),
      },
      {
        status: input.status,
        decision: input.decision ? Object.freeze({ ...input.decision }) : undefined,
        resolvedAt: input.resolvedAt,
      },
    );
  }

  resolve(decision: ConceptDecision, resolvedAt: string): Review {
    if (this.status !== 'pending') {
      throw new ConflictError(`Review ${this.id} is already resolved`);
    }

    if (decision.reference !== this.ambiguity.reference) {
      throw new InvalidInputError('Review decision must resolve its ambiguity');
    }

    assertSelectedCandidate(this.ambiguity, decision);
    assertUtcDateTime(resolvedAt, 'Review resolvedAt');

    return new Review(
      {
        id: this.id,
        interpretationId: this.interpretationId,
        entryId: this.entryId,
        ambiguity: this.ambiguity,
        createdAt: this.createdAt,
      },
      {
        status: 'resolved',
        decision: Object.freeze({ ...decision }),
        resolvedAt,
      },
    );
  }
}

function assertIdentity(input: CreateInterpretationReviewInput): void {
  assertText(input.id, 'Review id');
  assertText(input.interpretationId, 'Review interpretationId');
  assertText(input.entryId, 'Review entryId');
  assertText(input.ambiguity.reference, 'Review ambiguity reference');
  assertUtcDateTime(input.createdAt, 'Review createdAt');
}

function assertSelectedCandidate(ambiguity: ConceptAmbiguity, decision: ConceptDecision): void {
  if (decision.selectedConceptId === undefined) {
    return;
  }

  const candidateIds = ambiguity.candidates.map((candidate) => candidate.id);

  if (!candidateIds.includes(decision.selectedConceptId)) {
    throw new InvalidInputError(`Concept ${decision.selectedConceptId} is not a Review candidate`);
  }
}

function freezeAmbiguity(ambiguity: ConceptAmbiguity): ConceptAmbiguity {
  return Object.freeze({
    ...ambiguity,
    proposed: Object.freeze({
      ...ambiguity.proposed,
      aliases: ambiguity.proposed.aliases
        ? Object.freeze([...ambiguity.proposed.aliases])
        : undefined,
    }),
    candidates: Object.freeze(
      ambiguity.candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          aliases: Object.freeze([...candidate.aliases]),
        }),
      ),
    ),
  });
}
