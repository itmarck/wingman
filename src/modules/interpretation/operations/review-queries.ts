import { NotFoundError } from '../../../system/error.js';
import { type Page, pageSize } from '../../../system/page.js';
import type { Review, ReviewId } from '../domain/review.js';
import type { ReviewStore } from '../ports.js';

/** Retrieves one Review by identity, regardless of its status. */
export class GetReviewQuery {
  constructor(private readonly store: ReviewStore) {}

  async execute(id: ReviewId): Promise<Review> {
    const review = await this.store.findReview(id);
    if (!review) throw new NotFoundError(`Review ${id} does not exist`);
    return review;
  }
}

/** Retrieves pending Reviews for a human-facing feed. */
export class ListReviewsQuery {
  constructor(private readonly store: ReviewStore) {}

  execute(cursor?: string): Promise<Page<Review>> {
    return this.store.listPendingReviews({ cursor, limit: pageSize, scope: 'reviews' });
  }
}
