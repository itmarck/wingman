import { describe, expect, it } from 'vitest';
import { MemoryReviewStore } from '../adapters/memory/review.js';
import { Review } from '../domain/review.js';

describe('pending Review', () => {
  it('preserves one reference resolution as an independently resolvable feed item', async () => {
    const store = new MemoryReviewStore();
    const review = createReview('review-rust', 'rust');

    await store.saveReview(review);
    await store.saveReview(review);

    expect(await store.findReview(review.id)).toBe(review);
    expect(await store.findInterpretationReviews(review.interpretationId)).toEqual([review]);
    expect(await store.findPendingReviews(review.interpretationId)).toEqual([review]);
    expect((await store.listPendingReviews({ limit: 50, scope: 'reviews' })).items).toEqual([
      review,
    ]);
    expect(review.status).toBe('pending');
    expect(review.resolution.candidates).toHaveLength(2);
    expect(Object.isFrozen(review.resolution)).toBe(true);
  });

  it('allows several Reviews for different references in one Interpretation', async () => {
    const store = new MemoryReviewStore();
    const rust = createReview('review-rust', 'rust');
    const apple = createReview('review-apple', 'apple');

    await store.saveReviews([rust, apple]);

    expect(await store.findPendingReviews(rust.interpretationId)).toEqual([rust, apple]);
  });
});

function createReview(id: string, reference: string): Review {
  return Review.createInterpretation({
    id,
    interpretationId: 'interpretation-knowledge',
    entryId: 'entry-knowledge',
    resolution: {
      reference,
      question: `¿A qué Concept corresponde ${reference}?`,
      proposed: {
        reference,
        name: reference,
        definition: 'Ambiguous knowledge',
      },
      candidates: [
        {
          id: `concept-${reference}-first`,
          name: reference,
          aliases: [],
          definition: 'First meaning',
        },
        {
          id: `concept-${reference}-second`,
          name: reference,
          aliases: [],
          definition: 'Second meaning',
        },
      ],
    },
    createdAt: '2026-07-18T20:00:00Z',
  });
}
