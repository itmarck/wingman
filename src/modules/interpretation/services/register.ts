import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationDraft, ResolutionDecision } from '../domain/input.js';
import type { Interpretation, InterpreterIdentity } from '../domain/interpretation.js';
import { Review, type ReviewId } from '../domain/review.js';
import type {
  InterpretationClaim,
  InterpretationLifecycle,
  InterpretationPublicationPlan,
  InterpretationStore,
} from '../ports.js';
import type { InterpretationCompiler } from './compiler.js';
import {
  completeMissingResolutions,
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
  readonly plan: InterpretationPublicationPlan;
}

/** Registers Items and Component revisions extracted from an immutable Entry. */
export class RegisterInterpretationCommand {
  constructor(
    private readonly store: InterpretationStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly registry: SchemaRegistry,
    private readonly compiler: InterpretationCompiler,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    interpretation: Interpretation,
    input: InterpretationDraft,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const snapshot = await this.store.loadKnowledge();
    const completedInput = completeMissingResolutions(input, snapshot);
    validateInterpretationDraft(completedInput, snapshot, this.registry);
    if ((completedInput.decisions ?? []).length > 0)
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
    await this.lifecycle.publish(completed, emptyPlan, claim);
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
    const prepared = this.prepareRegistration(interpretation.id, input, snapshot, decisions);
    return Object.freeze({
      interpretation: interpretation.completeReview(
        [...decisions.values()],
        prepared.publication,
        this.clock.now().toISOString(),
      ),
      plan: prepared.plan,
    });
  }

  private async publish(
    interpretation: Interpretation,
    input: InterpretationDraft,
    interpreter: InterpreterIdentity,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ResolutionDecision>,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const prepared = this.prepareRegistration(interpretation.id, input, snapshot, decisions);
    const completed = interpretation.completeKnowledge(
      input,
      interpreter,
      prepared.publication,
      this.clock.now().toISOString(),
    );
    await this.lifecycle.publish(completed, prepared.plan, claim);
    return Object.freeze({ interpretation: completed, reviewIds: Object.freeze([]) });
  }

  private prepareRegistration(
    interpretationId: string,
    input: InterpretationDraft,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ResolutionDecision>,
  ) {
    const draft = Object.freeze({ ...input, decisions: Object.freeze([...decisions.values()]) });
    const plan = this.compiler.compile(
      interpretationId,
      draft,
      snapshot,
      this.clock.now().toISOString(),
    );
    if (plan.items.length === 0 && plan.revisions.length === 0 && declarationCount(input) === 0)
      throw new InvalidInputError('Interpretation Draft does not produce new knowledge');
    return { plan, publication: plan.publication };
  }
}

const emptyPlan: InterpretationPublicationPlan = Object.freeze({
  items: Object.freeze([]),
  revisions: Object.freeze([]),
  states: Object.freeze([]),
  automations: Object.freeze([]),
  intents: Object.freeze([]),
  outcomes: Object.freeze([]),
  publication: Object.freeze({ itemIds: Object.freeze([]), revisionIds: Object.freeze([]) }),
});

function requireDraft(interpretation: Interpretation): InterpretationDraft {
  if (!interpretation.draft)
    throw new ConflictError(`Interpretation ${interpretation.id} has no Draft`);
  return interpretation.draft;
}

function requireDecision(review: Review): ResolutionDecision {
  if (!review.decision) throw new ConflictError(`Review ${review.id} is unresolved`);
  return review.decision;
}
