import type { ConceptId } from '../../../core/knowledge/concept.js';
import { assertText, assertUtcDateTime } from '../../../core/knowledge/guard.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { InterpretationConcept, ReferenceDecision } from './input.js';
import type { InterpretationId } from './interpretation.js';

export type ReviewId = string;
export type ReviewKind = 'referenceResolution';
export type ReviewStatus = 'pending' | 'resolved';

export interface ReferenceCandidate {
  readonly id: ConceptId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly definition: string;
}

export interface ReferenceResolution {
  readonly reference: string;
  readonly question: string;
  readonly proposed: InterpretationConcept;
  readonly candidates: readonly ReferenceCandidate[];
}

export interface CreateInterpretationReviewInput {
  readonly id: ReviewId;
  readonly interpretationId: InterpretationId;
  readonly entryId: string;
  readonly resolution: ReferenceResolution;
  readonly createdAt: string;
}

export interface ReviewState {
  readonly status: ReviewStatus;
  readonly decision?: ReferenceDecision;
  readonly resolvedAt?: string;
}

export interface RehydrateReviewInput extends CreateInterpretationReviewInput, ReviewState {
  readonly kind: ReviewKind;
}

/**
 * Durable request that resolves one Draft reference to a proposed or existing Concept.
 */
export class Review {
  readonly id: ReviewId;
  readonly kind: ReviewKind;
  readonly status: ReviewStatus;
  readonly interpretationId: InterpretationId;
  readonly entryId: string;
  readonly resolution: ReferenceResolution;
  readonly createdAt: string;
  readonly decision?: ReferenceDecision;
  readonly resolvedAt?: string;

  private constructor(input: CreateInterpretationReviewInput, state: ReviewState) {
    this.id = input.id;
    this.kind = 'referenceResolution';
    this.status = state.status;
    this.interpretationId = input.interpretationId;
    this.entryId = input.entryId;
    this.resolution = input.resolution;
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
        resolution: freezeResolution(input.resolution),
      },
      {
        status: 'pending',
      },
    );
  }

  /**
   * Reconstructs a Review exactly as persisted while checking its invariants.
   */
  static rehydrate(input: RehydrateReviewInput): Review {
    assertIdentity(input);

    if (input.kind !== 'referenceResolution') {
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
      assertDecision(input.resolution, input.decision);
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
        resolution: freezeResolution(input.resolution),
      },
      {
        status: input.status,
        decision: input.decision ? Object.freeze({ ...input.decision }) : undefined,
        resolvedAt: input.resolvedAt,
      },
    );
  }

  resolve(decision: ReferenceDecision, resolvedAt: string): Review {
    if (this.status !== 'pending') {
      throw new ConflictError(`Review ${this.id} is already resolved`);
    }

    assertDecision(this.resolution, decision);
    assertUtcDateTime(resolvedAt, 'Review resolvedAt');

    return new Review(
      {
        id: this.id,
        interpretationId: this.interpretationId,
        entryId: this.entryId,
        resolution: this.resolution,
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
  assertText(input.resolution.reference, 'Review reference');
  assertText(input.resolution.question, 'Review question');
  assertText(input.resolution.proposed.reference, 'Review proposed reference');
  assertUtcDateTime(input.createdAt, 'Review createdAt');

  if (input.resolution.proposed.reference !== input.resolution.reference) {
    throw new InvalidInputError('Review proposed Concept must match its reference');
  }
}

function assertDecision(resolution: ReferenceResolution, decision: ReferenceDecision): void {
  if (decision.reference !== resolution.reference) {
    throw new InvalidInputError('Review decision must resolve its reference');
  }

  if (decision.selectedConceptId === undefined) {
    return;
  }

  const candidateIds = resolution.candidates.map((candidate) => candidate.id);

  if (!candidateIds.includes(decision.selectedConceptId)) {
    throw new InvalidInputError(`Concept ${decision.selectedConceptId} is not a Review candidate`);
  }
}

function freezeResolution(resolution: ReferenceResolution): ReferenceResolution {
  return Object.freeze({
    ...resolution,
    proposed: Object.freeze({
      ...resolution.proposed,
      aliases: resolution.proposed.aliases
        ? Object.freeze([...resolution.proposed.aliases])
        : undefined,
    }),
    candidates: Object.freeze(
      resolution.candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          aliases: Object.freeze([...candidate.aliases]),
        }),
      ),
    ),
  });
}
