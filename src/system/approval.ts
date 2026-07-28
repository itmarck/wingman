import type { Entry } from '../core/knowledge/entry.js';
import type { Interpretation } from '../modules/interpretation/domain/interpretation.js';
import type { Review } from '../modules/interpretation/domain/review.js';
import type { InterpretationLifecycle } from '../modules/interpretation/ports/lifecycle.js';
import type { InterpretationClaim } from '../modules/interpretation/ports/queue.js';
import type { InterpretationRegistration } from '../modules/interpretation/ports/store.js';
import type { MutationMode, ProposalChange, ProposalRegistry } from './proposal.js';

/**
 * Gates meaningful Interpretation writes while leaving queue bookkeeping operational.
 */
export class ApprovalInterpretationLifecycle implements InterpretationLifecycle {
  constructor(
    private readonly lifecycle: InterpretationLifecycle,
    private readonly proposals: ProposalRegistry,
    private readonly mode: MutationMode,
  ) {}

  capture(entry: Entry, createInterpretation: (entry: Entry) => Interpretation): Promise<Entry> {
    return this.lifecycle.capture(entry, createInterpretation);
  }

  queue(interpretation: Interpretation): Promise<void> {
    return this.lifecycle.queue(interpretation);
  }

  requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void> {
    return this.apply(
      [
        change('update', 'interpretation', interpretation),
        ...reviews.map((review) => change('create', 'review', review)),
      ],
      () => this.lifecycle.requestReviews(interpretation, reviews, claim),
    );
  }

  publish(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    claim?: InterpretationClaim,
  ): Promise<void> {
    return this.apply(
      [
        ...registration.concepts.map((concept) => change('upsert', 'concept', concept)),
        ...registration.predicates.map((predicate) => change('create', 'predicate', predicate)),
        ...registration.axioms.map((axiom) => change('create', 'axiom', axiom)),
        ...registration.links.map((link) => change('create', 'link', link)),
        change('update', 'interpretation', interpretation),
      ],
      () => this.lifecycle.publish(interpretation, registration, claim),
    );
  }

  publishReview(
    interpretation: Interpretation,
    registration: InterpretationRegistration,
    review: Review,
  ): Promise<void> {
    return this.apply(
      [
        ...registration.concepts.map((concept) => change('upsert', 'concept', concept)),
        ...registration.predicates.map((predicate) => change('create', 'predicate', predicate)),
        ...registration.axioms.map((axiom) => change('create', 'axiom', axiom)),
        ...registration.links.map((link) => change('create', 'link', link)),
        change('update', 'review', review),
        change('update', 'interpretation', interpretation),
      ],
      () => this.lifecycle.publishReview(interpretation, registration, review),
    );
  }

  retry(interpretation: Interpretation): Promise<void> {
    return this.lifecycle.retry(interpretation);
  }

  private apply(changes: readonly ProposalChange[], apply: () => Promise<void>): Promise<void> {
    if (this.mode === 'write') {
      return apply();
    }

    if (this.mode === 'approval') {
      return this.proposals.wait(changes, apply);
    }

    throw new Error('Background mutations are disabled in readonly mode');
  }
}

function change(
  operation: ProposalChange['operation'],
  target: string,
  value: unknown,
): ProposalChange {
  return Object.freeze({
    operation,
    target,
    value,
  });
}
