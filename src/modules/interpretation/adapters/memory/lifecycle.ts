import type { MemoryLock } from '../../../../adapters/memory/lock.js';
import type { Entry } from '../../../../core/knowledge/entry.js';
import { ConflictError } from '../../../../system/error.js';
import type { MemoryKnowledgeStore } from '../../../knowledge/adapters/memory/store.js';
import type { Interpretation } from '../../domain/interpretation.js';
import type { Review } from '../../domain/review.js';
import type { InterpretationLifecycle } from '../../ports/lifecycle.js';
import type { InterpretationClaim } from '../../ports/queue.js';
import type { InterpretationRegistration } from '../../ports/store.js';
import type { MemoryInterpretations } from './interpretation.js';
import type { MemoryReviewStore } from './review.js';

/**
 * Implements compound Interpretation writes over the shared in-memory adapters.
 */
export class MemoryInterpretationLifecycle implements InterpretationLifecycle {
  constructor(
    private readonly knowledge: MemoryKnowledgeStore,
    private readonly interpretations: MemoryInterpretations,
    private readonly reviews: MemoryReviewStore,
    private readonly lock: MemoryLock,
  ) {}

  async capture(
    entry: Entry,
    createInterpretation: (entry: Entry) => Interpretation,
  ): Promise<Entry> {
    return this.lock.run(async () => {
      const interpretation = createInterpretation(entry);
      const collision = await this.interpretations.findInterpretation(interpretation.id);

      if (collision) {
        throw new ConflictError(`Interpretation id ${interpretation.id} already exists`);
      }

      const stored = await this.knowledge.saveEntry(entry);
      const existing = await this.interpretations.findLatestInterpretation(stored.id);

      if (existing) {
        return stored;
      }

      await this.queueWithoutLock(interpretation);
      return stored;
    });
  }

  async queue(interpretation: Interpretation): Promise<void> {
    await this.lock.run(() => this.queueWithoutLock(interpretation));
  }

  async requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      await this.reviews.saveReviews(reviews);
      await this.interpretations.saveInterpretation(interpretation);
    });
  }

  async publish(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      await this.knowledge.saveInterpretation(registration);
      await this.interpretations.saveInterpretation(interpretation);
    });
  }

  async publishReview(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    review: Review,
  ): Promise<void> {
    await this.lock.run(async () => {
      await this.knowledge.saveInterpretation(registration);
      await this.reviews.saveReview(review);
      await this.interpretations.saveInterpretation(interpretation);
    });
  }

  async retry(interpretation: Interpretation): Promise<void> {
    await this.lock.run(() => this.queueWithoutLock(interpretation));
  }

  private async queueWithoutLock(interpretation: Interpretation): Promise<void> {
    await this.interpretations.saveInterpretation(interpretation);
    await this.interpretations.enqueue(interpretation.id);
  }

  private assertClaim(claim: InterpretationClaim | undefined): void {
    if (claim) {
      this.interpretations.assertClaim(claim);
    }
  }
}
