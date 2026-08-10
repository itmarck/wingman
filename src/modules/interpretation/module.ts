import type { ResolveReviewCommand } from './operations/resolve-review.js';
import type { RetryEntryCommand } from './operations/retry.js';
import type { GetReviewQuery, ListReviewsQuery } from './operations/review-queries.js';
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
