import { type Page, pageSize } from '../../../system/page.js';
import type { Review } from '../domain/review.js';
import type { ReviewStore } from '../ports/review.js';

/**
 * Retrieves pending Reviews for a human-facing feed.
 */
export class ListReviewsQuery {
  constructor(private readonly store: ReviewStore) {}

  execute(cursor?: string): Promise<Page<Review>> {
    return this.store.listPendingReviews({
      cursor,
      limit: pageSize,
      scope: 'reviews',
    });
  }
}
