import type { GetReviewQuery } from './operations/get-review.js';
import type { ListReviewsQuery } from './operations/list-reviews.js';
import type { ResolveReviewCommand } from './operations/resolve-review.js';
import type { RetryEntryCommand } from './operations/retry.js';
import type { GetEntryStatusQuery } from './operations/status.js';
import type { ProcessNextCommand } from './operations/worker.js';

export interface InterpretationModule {
  readonly processNext: ProcessNextCommand;
  readonly resolveReview: ResolveReviewCommand;
  readonly retryEntry: RetryEntryCommand;
  readonly getEntryStatus: GetEntryStatusQuery;
  readonly getReview: GetReviewQuery;
  readonly listReviews: ListReviewsQuery;
}
