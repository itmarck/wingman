import type { Entry } from '../../../core/knowledge/entry.js';
import type { Interpretation } from '../domain/interpretation.js';
import type { Review } from '../domain/review.js';
import type { InterpretationClaim } from './queue.js';
import type { InterpretationRegistration } from './store.js';

/**
 * Atomic persistence required by compound Interpretation transitions.
 */
export interface InterpretationLifecycle {
  capture(entry: Entry, createInterpretation: (entry: Entry) => Interpretation): Promise<Entry>;
  queue(interpretation: Interpretation): Promise<void>;
  requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void>;
  publish(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    claim?: InterpretationClaim,
  ): Promise<void>;
  publishReview(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    review: Review,
  ): Promise<void>;
  retry(interpretation: Interpretation): Promise<void>;
}
