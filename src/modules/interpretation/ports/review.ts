import type { Page, PageRequest } from '../../../system/page.js';
import type { Review, ReviewId } from '../domain/review.js';

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
