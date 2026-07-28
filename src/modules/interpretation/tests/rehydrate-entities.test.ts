import { describe, expect, it } from 'vitest';
import { Axiom } from '../../../core/knowledge/axiom.js';
import { Concept } from '../../../core/knowledge/concept.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { Link } from '../../../core/knowledge/link.js';
import { Predicate } from '../../../core/knowledge/predicate.js';
import { Interpretation } from '../domain/interpretation.js';
import { Review } from '../domain/review.js';

describe('entity rehydration', () => {
  it('reconstructs persisted knowledge and processing state as immutable entities', () => {
    const entry = Entry.rehydrate({
      id: 'entry-rehydrated',
      content: {
        kind: 'text',
        text: 'Wingman preserves original information.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-42',
      },
      capturedAt: '2026-07-20T12:00:00Z',
    });
    const concept = Concept.rehydrate({
      id: 'concept-wingman',
      name: 'Wingman',
      aliases: ['Personal brain'],
      definition: 'Personal knowledge and automation system',
    });
    const predicate = Predicate.rehydrate({
      id: 'predicate-preserves',
      key: 'preserves',
      definition: 'Indicates information that remains unchanged',
      origin: 'custom',
      scope: 'both',
    });
    const firstAxiom = Axiom.rehydrate({
      id: 'axiom-first',
      entryId: entry.id,
      subjectConceptId: concept.id,
      predicateId: predicate.id,
      object: {
        kind: 'literal',
        literal: {
          kind: 'text',
          value: 'Original information',
        },
      },
    });
    const secondAxiom = Axiom.rehydrate({
      id: 'axiom-second',
      entryId: entry.id,
      subjectConceptId: concept.id,
      predicateId: predicate.id,
      object: {
        kind: 'literal',
        literal: {
          kind: 'text',
          value: 'History',
        },
      },
    });
    const link = Link.rehydrate({
      id: 'link-history',
      sourceAxiomId: firstAxiom.id,
      predicateId: predicate.id,
      targetAxiomId: secondAxiom.id,
      provenance: {
        kind: 'entry',
        entryId: entry.id,
      },
    });
    const interpretation = Interpretation.rehydrate({
      id: 'interpretation-completed',
      entryId: entry.id,
      status: 'completed',
      attempts: 1,
      createdAt: '2026-07-20T12:00:00Z',
      updatedAt: '2026-07-20T12:01:00Z',
      interpreter: {
        key: 'deterministic',
      },
      publication: {
        conceptIds: [concept.id],
        predicateIds: [predicate.id],
        axiomIds: [firstAxiom.id, secondAxiom.id],
        linkIds: [link.id],
      },
    });
    const review = Review.rehydrate({
      id: 'review-rust',
      kind: 'ambiguousConcept',
      status: 'resolved',
      interpretationId: interpretation.id,
      entryId: entry.id,
      ambiguity: {
        reference: 'rust',
        proposed: {
          reference: 'rust',
          name: 'Rust',
          definition: 'Technology',
        },
        candidates: [
          {
            id: 'concept-rust',
            name: 'Rust',
            aliases: [],
            definition: 'Programming language',
          },
        ],
      },
      createdAt: '2026-07-20T12:00:00Z',
      decision: {
        reference: 'rust',
        selectedConceptId: 'concept-rust',
      },
      resolvedAt: '2026-07-20T12:02:00Z',
    });

    expect([entry, concept, predicate, firstAxiom, secondAxiom, link].every(Object.isFrozen)).toBe(
      true,
    );
    expect(interpretation.publication?.axiomIds).toEqual(['axiom-first', 'axiom-second']);
    expect(Object.isFrozen(interpretation.publication?.axiomIds)).toBe(true);
    expect(review.status).toBe('resolved');
    expect(Object.isFrozen(review.ambiguity.candidates)).toBe(true);
  });

  it('rejects persisted state that violates essential invariants', () => {
    expect(() =>
      Interpretation.rehydrate({
        id: 'interpretation-corrupt',
        entryId: 'entry-corrupt',
        status: 'completed',
        attempts: 1,
        createdAt: '2026-07-20T12:00:00Z',
        updatedAt: '2026-07-20T12:01:00Z',
      }),
    ).toThrow('Completed Interpretation requires a publication and Interpreter');

    expect(() =>
      Review.rehydrate({
        id: 'review-corrupt',
        kind: 'ambiguousConcept',
        status: 'resolved',
        interpretationId: 'interpretation-corrupt',
        entryId: 'entry-corrupt',
        ambiguity: {
          reference: 'rust',
          proposed: {
            reference: 'rust',
            name: 'Rust',
            definition: 'Technology',
          },
          candidates: [],
        },
        createdAt: '2026-07-20T12:00:00Z',
      }),
    ).toThrow('Resolved Review requires a decision and resolvedAt');
  });
});
