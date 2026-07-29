import { describe, expect, it } from 'vitest';
import type { InterpretationAdapter } from '../services/interpreter.js';
import type { InterpretationRequest } from '../services/request.js';
import { createInterpretationTestSystem as createMemoryApplication } from './support.js';

describe('ambiguous Interpretation', () => {
  it('uses the same reference resolution contract for model-requested authorship', async () => {
    const adapter = new RequestedResolutionInterpreter();
    const application = createMemoryApplication(adapter);
    const marcelo = await application.commands.registerConcept.execute({
      name: 'Marcelo',
      definition: 'Propietario de Wingman',
    });
    adapter.setCandidate(marcelo.id);
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'He creado Wingman este año.',
      },
      origin: {
        source: 'external',
      },
    });

    await application.commands.processNext.execute();

    const review = requireValue((await application.queries.listReviews.execute()).items[0]);

    expect(review).toMatchObject({
      kind: 'referenceResolution',
      resolution: {
        reference: 'speaker',
        question: '¿Quién expresa «he creado»?',
      },
    });

    await application.commands.resolveReview.execute({
      reviewId: review.id,
      decision: {
        reference: 'speaker',
        selectedConceptId: marcelo.id,
      },
    });

    expect((await application.queries.getEntryStatus.execute(entryId)).status).toBe('completed');
    expect(requireValue((await currentAxioms(application))[0]).subjectConceptId).toBe(marcelo.id);
  });

  it('publishes no knowledge until every independent Review is resolved', async () => {
    const application = createMemoryApplication(new AmbiguousInterpreter());

    await registerAmbiguousConcepts(application);

    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'I want to study Rust on an Apple computer.',
      },
      origin: {
        source: 'minima',
        externalId: 'ambiguous-entry',
      },
    });

    await application.commands.processNext.execute();

    const reviews = await application.queries.listReviews.execute();
    const [first, second] = reviews.items;

    expect(reviews.items).toHaveLength(2);
    expect((await application.queries.getEntryStatus.execute(entryId)).status).toBe('pending');
    expect(await currentAxioms(application)).toEqual([]);

    await application.commands.resolveReview.execute({
      reviewId: requireValue(first).id,
      decision: selectFirstCandidate(requireValue(first)),
    });

    expect((await application.queries.listReviews.execute()).items).toHaveLength(1);
    expect(await currentAxioms(application)).toEqual([]);

    await application.commands.resolveReview.execute({
      reviewId: requireValue(second).id,
      decision: selectFirstCandidate(requireValue(second)),
    });

    expect((await application.queries.listReviews.execute()).items).toEqual([]);
    expect((await application.queries.getEntryStatus.execute(entryId)).status).toBe('completed');
    expect(await currentAxioms(application)).toHaveLength(2);

    await expect(
      application.commands.resolveReview.execute({
        reviewId: requireValue(second).id,
        decision: selectFirstCandidate(requireValue(second)),
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('completes concurrent decisions once without exposing partial knowledge', async () => {
    const application = createMemoryApplication(new AmbiguousInterpreter());

    await registerAmbiguousConcepts(application);

    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'I want to study Rust on an Apple computer.',
      },
      origin: {
        source: 'minima',
        externalId: 'concurrent-ambiguities',
      },
    });

    await application.commands.processNext.execute();

    const reviews = (await application.queries.listReviews.execute()).items;
    const first = requireValue(reviews[0]);
    const second = requireValue(reviews[1]);

    await Promise.all([
      application.commands.resolveReview.execute({
        reviewId: first.id,
        decision: selectFirstCandidate(first),
      }),
      application.commands.resolveReview.execute({
        reviewId: second.id,
        decision: selectFirstCandidate(second),
      }),
    ]);

    expect((await application.queries.getEntryStatus.execute(entryId)).status).toBe('completed');
    expect(await currentAxioms(application)).toHaveLength(2);
    expect((await application.queries.listReviews.execute()).items).toEqual([]);
  });

  it('rejects the complete Draft before creating Reviews for one valid ambiguity', async () => {
    const application = createMemoryApplication(new InvalidAmbiguousInterpreter());

    await application.commands.registerConcept.execute({
      name: 'Rust',
      definition: 'Programming language',
    });
    await application.commands.registerConcept.execute({
      name: 'Rust',
      definition: 'Survival video game',
    });

    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Rust with an invalid internal reference.',
      },
      origin: {
        source: 'minima',
        externalId: 'invalid-ambiguous-draft',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toMatchObject({
      code: 'invalidInput',
    });

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'failed',
      interpreter: {
        key: 'invalid-ambiguous',
      },
      draft: {
        entryId,
      },
    });
    expect((await application.queries.listReviews.execute()).items).toEqual([]);
    expect(await currentAxioms(application)).toEqual([]);
  });
});

class AmbiguousInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'ambiguous',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [
          {
            reference: 'rust',
            name: 'Rust',
            definition: 'Technology mentioned by the user',
          },
          {
            reference: 'apple',
            name: 'Apple',
            definition: 'Thing mentioned by the user',
          },
        ],
        predicates: [
          {
            key: 'mentionedIn',
            definition: 'Indicates context mentioned by the user',
            origin: 'custom',
            scope: 'axiom',
          },
        ],
        axioms: [
          {
            reference: 'rust-context',
            subjectReference: 'rust',
            predicateKey: 'mentionedIn',
            object: {
              kind: 'literal',
              literal: {
                kind: 'text',
                value: 'Study',
              },
            },
          },
          {
            reference: 'apple-context',
            subjectReference: 'apple',
            predicateKey: 'mentionedIn',
            object: {
              kind: 'literal',
              literal: {
                kind: 'text',
                value: 'Computer',
              },
            },
          },
        ],
      },
    };
  }
}

class InvalidAmbiguousInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'invalid-ambiguous',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [
          {
            reference: 'rust',
            name: 'Rust',
            definition: 'Technology mentioned by the user',
          },
        ],
        predicates: [
          {
            key: 'mentions',
            definition: 'Indicates a mention',
            origin: 'custom',
            scope: 'axiom',
          },
        ],
        axioms: [
          {
            reference: 'invalid-reference',
            subjectReference: 'missing',
            predicateKey: 'mentions',
            object: {
              kind: 'literal',
              literal: {
                kind: 'text',
                value: 'Rust',
              },
            },
          },
        ],
      },
    };
  }
}

class RequestedResolutionInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'requested-resolution',
  });

  #candidateConceptId?: string;

  setCandidate(conceptId: string): void {
    this.#candidateConceptId = conceptId;
  }

  async interpret(request: InterpretationRequest) {
    const candidateConceptId = requireValue(this.#candidateConceptId);

    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [
          {
            reference: 'speaker',
            name: 'Persona hablante',
            definition: 'Persona cuya identidad requiere confirmación',
          },
        ],
        predicates: [
          {
            key: 'createdWingman',
            definition: 'Indica que la persona creó Wingman',
            origin: 'custom',
            scope: 'axiom',
          },
        ],
        axioms: [
          {
            reference: 'creation',
            subjectReference: 'speaker',
            predicateKey: 'createdWingman',
            object: {
              kind: 'literal',
              literal: {
                kind: 'boolean',
                value: true,
              },
            },
          },
        ],
        referenceResolutions: [
          {
            reference: 'speaker',
            question: '¿Quién expresa «he creado»?',
            candidateConceptIds: [candidateConceptId],
          },
        ],
      },
    };
  }
}

async function registerAmbiguousConcepts(
  application: ReturnType<typeof createMemoryApplication>,
): Promise<void> {
  for (const concept of [
    ['Rust', 'Programming language'],
    ['Rust', 'Survival video game'],
    ['Apple', 'Technology company'],
    ['Apple', 'Fruit'],
  ] as const) {
    await application.commands.registerConcept.execute({
      name: concept[0],
      definition: concept[1],
    });
  }
}

function selectFirstCandidate(review: {
  readonly resolution: {
    readonly reference: string;
    readonly candidates: readonly { readonly id: string }[];
  };
}) {
  return {
    reference: review.resolution.reference,
    selectedConceptId: requireValue(review.resolution.candidates[0]).id,
  };
}

async function currentAxioms(application: ReturnType<typeof createMemoryApplication>) {
  const projection = await application.queries.readProjection.execute('system.currentAxioms');

  return projection.data.axioms as readonly { readonly subjectConceptId: string }[];
}

function requireValue<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error('Expected value');
  }

  return value;
}
