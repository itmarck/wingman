import { NotFoundError } from '../../../system/error.js';
import type { Clock } from '../../../system/runtime.js';
import type { ReferenceDecision } from '../domain/input.js';
import type { Review } from '../domain/review.js';
import type {
  InterpretationDeclarationPublisher,
  InterpretationLifecycle,
  InterpretationStateStore,
  ReviewStore,
} from '../ports.js';
import type { RegisterInterpretationCommand } from '../services/register.js';

export interface ResolveReviewInput {
  readonly reviewId: string;
  readonly decision: ReferenceDecision;
}

/**
 * Applies human decisions and resumes the operation blocked by a Review.
 */
export class ResolveReviewCommand {
  constructor(
    private readonly reviews: ReviewStore,
    private readonly interpretations: InterpretationStateStore,
    private readonly registerInterpretation: RegisterInterpretationCommand,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly declarations: InterpretationDeclarationPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(input: ResolveReviewInput): Promise<void> {
    const review = await this.reviews.findReview(input.reviewId);

    if (!review) {
      throw new NotFoundError(`Review ${input.reviewId} does not exist`);
    }

    const resolved = review.resolve(input.decision, this.clock.now().toISOString());
    const resolution = await this.reviews.stageResolution(resolved);

    if (!resolution.requiresCompletion) {
      return;
    }

    try {
      await this.completeInterpretation(resolved, resolution.reviews);
      await this.reviews.finishCompletion(review.interpretationId);
    } catch (error) {
      await this.reviews.releaseCompletion(review.interpretationId);
      throw error;
    }
  }

  private async completeInterpretation(
    resolved: Review,
    reviews: readonly Review[],
  ): Promise<void> {
    const interpretation = await this.interpretations.findInterpretation(resolved.interpretationId);

    if (!interpretation) {
      throw new NotFoundError(`Interpretation ${resolved.interpretationId} does not exist`);
    }

    const prepared = await this.registerInterpretation.prepareReviewCompletion(
      interpretation,
      reviews,
    );

    await this.lifecycle.publishReview(prepared.interpretation, prepared.registration, resolved);
    if (prepared.interpretation.draft)
      await this.declarations.execute(prepared.interpretation.draft);
  }
}
