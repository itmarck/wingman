import { MemoryLock } from '../../../../adapters/memory/lock.js';
import { createPage } from '../../../../adapters/memory/page.js';
import { ConflictError } from '../../../../system/error.js';
import type { Page, PageRequest } from '../../../../system/page.js';
import type { Review, ReviewId } from '../../domain/review.js';
import type { ReviewResolution, ReviewStore } from '../../ports.js';

/**
 * In-memory Review persistence used while the durable adapter is not selected.
 */
export class MemoryReviewStore implements ReviewStore {
  readonly #reviews = new Map<ReviewId, Review>();
  readonly #completions = new Set<string>();

  constructor(private readonly lock = new MemoryLock()) {}

  async saveReview(review: Review): Promise<void> {
    this.assertCanSave(review);
    this.#reviews.set(review.id, review);
  }

  async saveReviews(reviews: readonly Review[]): Promise<void> {
    const ids = reviews.map((review) => review.id);

    if (new Set(ids).size !== ids.length) {
      throw new ConflictError('Reviews cannot contain duplicate identities');
    }

    for (const review of reviews) {
      this.assertCanSave(review);
    }

    for (const review of reviews) {
      this.#reviews.set(review.id, review);
    }
  }

  async findReview(id: ReviewId): Promise<Review | undefined> {
    return this.#reviews.get(id);
  }

  async findInterpretationReviews(interpretationId: string): Promise<readonly Review[]> {
    return Object.freeze(
      [...this.#reviews.values()].filter((review) => review.interpretationId === interpretationId),
    );
  }

  async findPendingReviews(interpretationId: string): Promise<readonly Review[]> {
    const reviews = await this.findInterpretationReviews(interpretationId);

    return Object.freeze(reviews.filter((review) => review.status === 'pending'));
  }

  async findPendingEntryReviews(entryId: string): Promise<readonly Review[]> {
    return Object.freeze(
      [...this.#reviews.values()].filter(
        (review) => review.entryId === entryId && review.status === 'pending',
      ),
    );
  }

  async listPendingReviews(request: PageRequest): Promise<Page<Review>> {
    const pending = [...this.#reviews.values()].filter((review) => review.status === 'pending');

    return createPage(pending, request, (review) => ({
      id: review.id,
      timestamp: review.createdAt,
    }));
  }

  async stageResolution(review: Review): Promise<ReviewResolution> {
    return this.lock.run(async () => {
      this.assertCanSave(review);

      const related = [...this.#reviews.values()].filter(
        (candidate) => candidate.interpretationId === review.interpretationId,
      );
      const reviews = related.map((candidate) => (candidate.id === review.id ? review : candidate));
      const hasPendingReview = reviews.some((candidate) => candidate.status === 'pending');

      if (hasPendingReview) {
        this.#reviews.set(review.id, review);

        return Object.freeze({
          reviews: Object.freeze(reviews),
          requiresCompletion: false,
        });
      }

      if (this.#completions.has(review.interpretationId)) {
        throw new ConflictError(
          `Interpretation ${review.interpretationId} Review completion is already running`,
        );
      }

      this.#completions.add(review.interpretationId);

      return Object.freeze({
        reviews: Object.freeze(reviews),
        requiresCompletion: true,
      });
    });
  }

  async finishCompletion(interpretationId: string): Promise<void> {
    await this.lock.run(async () => {
      this.#completions.delete(interpretationId);
    });
  }

  async releaseCompletion(interpretationId: string): Promise<void> {
    await this.finishCompletion(interpretationId);
  }

  private assertCanSave(review: Review): void {
    const existing = this.#reviews.get(review.id);

    if (existing?.status === 'resolved' && existing !== review) {
      throw new ConflictError(`Review ${review.id} is already resolved`);
    }
  }
}
