import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ReferenceDecision, RegisterInterpretationInput } from '../domain/input.js';
import type { Interpretation, InterpreterIdentity } from '../domain/interpretation.js';
import { Review, type ReviewId } from '../domain/review.js';
import type {
  InterpretationClaim,
  InterpretationLifecycle,
  InterpretationRegistration,
  InterpretationStore,
} from '../ports.js';
import {
  completeMissingResolutions,
  createRegistration,
  declarationCount,
  findPendingResolutions,
} from './registration.js';
import { validateInterpretationDraft } from './validate.js';

export interface RegisterInterpretationResult {
  readonly interpretation: Interpretation;
  readonly reviewIds: readonly ReviewId[];
}

export interface PreparedReviewCompletion {
  readonly interpretation: Interpretation;
  readonly registration: InterpretationRegistration;
}

/** Registers Items and Component revisions extracted from an immutable Entry. */
export class RegisterInterpretationCommand {
  constructor(
    private readonly store: InterpretationStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly registry: SchemaRegistry,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    interpretation: Interpretation,
    input: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const snapshot = await this.store.loadKnowledge();
    const completedInput = completeMissingResolutions(input, snapshot);
    validateInterpretationDraft(completedInput, snapshot, this.registry);
    if ((completedInput.referenceDecisions ?? []).length > 0)
      throw new InvalidInputError('Interpreter cannot make reference decisions');
    const resolutions = findPendingResolutions(completedInput, snapshot, new Map());
    if (resolutions.length > 0) {
      const reviews = resolutions.map((resolution) =>
        Review.createInterpretation({
          id: this.ids.generate(),
          interpretationId: interpretation.id,
          entryId: input.entryId,
          resolution,
          createdAt: this.clock.now().toISOString(),
        }),
      );
      const pending = interpretation.requestReview(
        completedInput,
        interpreter,
        this.clock.now().toISOString(),
      );
      await this.lifecycle.requestReviews(pending, reviews, claim);
      return Object.freeze({
        interpretation: pending,
        reviewIds: Object.freeze(reviews.map((review) => review.id)),
      });
    }
    return this.publish(interpretation, completedInput, interpreter, snapshot, new Map(), claim);
  }

  async completeEmpty(
    interpretation: Interpretation,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<Interpretation> {
    const completed = interpretation.completeEmpty(interpreter, this.clock.now().toISOString());
    await this.lifecycle.publish(completed, { items: [], revisions: [] }, claim);
    return completed;
  }

  async prepareReviewCompletion(
    interpretation: Interpretation,
    reviews: readonly Review[],
  ): Promise<PreparedReviewCompletion> {
    const input = requireDraft(interpretation);
    const snapshot = await this.store.loadKnowledge();
    validateInterpretationDraft(input, snapshot, this.registry);
    const decisions = new Map(
      reviews.map((review) => [review.resolution.reference, requireDecision(review)]),
    );
    if (findPendingResolutions(input, snapshot, decisions).length > 0)
      throw new ConflictError(
        `Interpretation ${interpretation.id} still has unresolved references`,
      );
    const prepared = this.prepareRegistration(input, snapshot, decisions);
    return Object.freeze({
      interpretation: interpretation.completeReview(
        [...decisions.values()],
        prepared.publication,
        this.clock.now().toISOString(),
      ),
      registration: prepared.registration,
    });
  }

  private async publish(
    interpretation: Interpretation,
    input: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ReferenceDecision>,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const prepared = this.prepareRegistration(input, snapshot, decisions);
    const completed = interpretation.completeKnowledge(
      input,
      interpreter,
      prepared.publication,
      this.clock.now().toISOString(),
    );
    await this.lifecycle.publish(completed, prepared.registration, claim);
    return Object.freeze({ interpretation: completed, reviewIds: Object.freeze([]) });
  }

  private prepareRegistration(
    input: RegisterInterpretationInput,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ReferenceDecision>,
  ) {
    const prepared = createRegistration(
      input,
      snapshot,
      decisions,
      this.registry,
      this.ids,
      this.clock.now().toISOString(),
    );
    if (
      prepared.registration.items.length === 0 &&
      prepared.registration.revisions.length === 0 &&
      declarationCount(input) === 0
    )
      throw new InvalidInputError('Interpretation Draft does not produce new knowledge');
    return prepared;
  }
}

function requireDraft(interpretation: Interpretation): RegisterInterpretationInput {
  if (!interpretation.draft)
    throw new ConflictError(`Interpretation ${interpretation.id} has no Draft`);
  return interpretation.draft;
}

function requireDecision(review: Review): ReferenceDecision {
  if (!review.decision) throw new ConflictError(`Review ${review.id} is unresolved`);
  return review.decision;
}
