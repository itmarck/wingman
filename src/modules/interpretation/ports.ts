import type { ComponentRevision } from '../../core/item/component.js';
import type { Item } from '../../core/item/item.js';
import type { KnowledgeSnapshot } from '../../core/item/snapshot.js';
import type { ComponentValue } from '../../core/item/types.js';
import type { Entry } from '../../core/knowledge/entry.js';
import { ConflictError } from '../../system/error.js';
import type { Page, PageRequest } from '../../system/page.js';
import type { InterpretationDeclaration } from './domain/declaration.js';
import type { RegisterInterpretationInput } from './domain/input.js';
import type { Interpretation, InterpretationId } from './domain/interpretation.js';
import type { Review, ReviewId } from './domain/review.js';
import type { ReasoningLevel } from './services/request.js';

export interface InterpretationRegistration {
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
}

export interface InterpretationPublication {
  readonly itemIds: readonly string[];
  readonly revisionIds: readonly string[];
}

export interface InterpretationStore {
  loadKnowledge(): Promise<KnowledgeSnapshot>;
  saveInterpretation(registration: InterpretationRegistration): Promise<void>;
}

export interface InterpretationStateStore {
  saveInterpretation(interpretation: Interpretation): Promise<void>;
  findInterpretation(id: InterpretationId): Promise<Interpretation | undefined>;
  findLatestInterpretation(entryId: string): Promise<Interpretation | undefined>;
  listInterpretations(entryId: string): Promise<readonly Interpretation[]>;
}

export interface ClaimInterpretationInput {
  readonly claimId: string;
  readonly claimedAt: string;
  readonly leaseUntil: string;
}

export interface InterpretationClaim {
  readonly interpretationId: InterpretationId;
  readonly claimId: string;
  readonly leaseUntil: string;
  readonly recovered: boolean;
}

export class InterpretationClaimError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'InterpretationClaimError';
  }
}

/** Boundary for scheduling durable Interpretation work. */
export interface InterpretationQueue {
  enqueue(interpretationId: InterpretationId): Promise<void>;
  claim(input: ClaimInterpretationInput): Promise<InterpretationClaim | undefined>;
  start(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
  renew(claim: InterpretationClaim, leaseUntil: string): Promise<void>;
  complete(claim: InterpretationClaim): Promise<void>;
  retry(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
  fail(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
}

export interface ReviewResolution {
  readonly reviews: readonly Review[];
  readonly requiresCompletion: boolean;
}

export interface ReviewStore {
  saveReview(review: Review): Promise<void>;
  saveReviews(reviews: readonly Review[]): Promise<void>;
  findReview(id: ReviewId): Promise<Review | undefined>;
  findInterpretationReviews(interpretationId: string): Promise<readonly Review[]>;
  findPendingReviews(interpretationId: string): Promise<readonly Review[]>;
  findPendingEntryReviews(entryId: string): Promise<readonly Review[]>;
  listPendingReviews(request: PageRequest): Promise<Page<Review>>;
  stageResolution(review: Review): Promise<ReviewResolution>;
  finishCompletion(interpretationId: string): Promise<void>;
  releaseCompletion(interpretationId: string): Promise<void>;
}

/** Atomic persistence required by compound Interpretation transitions. */
export interface InterpretationLifecycle {
  capture(entry: Entry, createInterpretation: (entry: Entry) => Interpretation): Promise<Entry>;
  queue(interpretation: Interpretation): Promise<void>;
  requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void>;
  publish(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    claim?: InterpretationClaim,
  ): Promise<void>;
  publishReview(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    review: Review,
  ): Promise<void>;
  retry(interpretation: Interpretation): Promise<void>;
}

export type DeclarationOutcomeStatus = 'applied' | 'needsInput' | 'unsupported' | 'failed';

export interface DeclarationOutcome {
  readonly entryId: string;
  readonly reference: string;
  readonly kind: InterpretationDeclaration['kind'];
  readonly status: DeclarationOutcomeStatus;
  readonly targetId?: string;
  readonly reason?: string;
  readonly details?: ComponentValue;
  readonly recordedAt: string;
}

export interface DeclarationOutcomeSource {
  list(entryId?: string): Promise<readonly DeclarationOutcome[]>;
}

export interface InterpretationDeclarationPublisher {
  execute(input: RegisterInterpretationInput): Promise<void>;
}

export type InferenceResult = 'empty' | 'error' | 'invalid' | 'knowledge';

export interface InferenceRun {
  readonly interpretationId: string;
  readonly operation: string;
  readonly reasoning: ReasoningLevel;
  readonly target: string;
  readonly provider: string;
  readonly requestedModel: string;
  readonly usedModel: string;
  readonly attempt: number;
  readonly durationMs: number;
  readonly result: InferenceResult;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly errorCategory?: string;
  readonly createdAt: string;
}

/** Best-effort technical telemetry for model executions. */
export interface InferenceTelemetry {
  record(run: InferenceRun): Promise<void>;
}
