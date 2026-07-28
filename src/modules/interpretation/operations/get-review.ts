import { NotFoundError } from '../../../system/error.js';
import type { Review, ReviewId } from '../domain/review.js';
import type { ReviewStore } from '../ports/review.js';

/**
 * Retrieves one Review by identity, regardless of its status.
 */
export class GetReviewQuery {
  constructor(private readonly store: ReviewStore) {}

  async execute(id: ReviewId): Promise<Review> {
    const review = await this.store.findReview(id);

    if (!review) {
      throw new NotFoundError(`Review ${id} does not exist`);
    }

    return review;
  }
}
