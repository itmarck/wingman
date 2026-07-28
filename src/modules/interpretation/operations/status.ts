import type { InterpretationStatus } from '../domain/interpretation.js';
import type { ReviewStore } from '../ports/review.js';
import type { InterpretationStateStore } from '../ports/state.js';
import { GetInterpretationQuery } from './get.js';

export interface EntryStatusResult {
  readonly entryId: string;
  readonly interpretationId: string;
  readonly status: InterpretationStatus;
  readonly attempts: number;
  readonly updatedAt: string;
  readonly availableAt?: string;
  readonly error?: string;
  readonly reviewIds: readonly string[];
}

/**
 * Derives the user-facing state from operational processing and pending Reviews.
 */
export class GetEntryStatusQuery {
  readonly #getInterpretation: GetInterpretationQuery;

  constructor(
    interpretations: InterpretationStateStore,
    private readonly reviews: ReviewStore,
  ) {
    this.#getInterpretation = new GetInterpretationQuery(interpretations);
  }

  async execute(entryId: string): Promise<EntryStatusResult> {
    const interpretation = await this.#getInterpretation.execute(entryId);
    const reviews = await this.reviews.findPendingReviews(interpretation.id);

    return Object.freeze({
      entryId,
      interpretationId: interpretation.id,
      status: interpretation.status,
      attempts: interpretation.attempts,
      updatedAt: interpretation.updatedAt,
      availableAt: interpretation.availableAt,
      error: interpretation.error,
      reviewIds: Object.freeze(reviews.map((review) => review.id)),
    });
  }
}
