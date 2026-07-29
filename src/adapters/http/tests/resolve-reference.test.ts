import { describe, expect, it } from 'vitest';
import type { InterpretationAdapter } from '../../../modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../../modules/interpretation/services/request.js';
import { createSystem } from '../../../system/system.js';
import { createHttpServer } from '../server.js';
import { authorization, signingSecret } from './support.js';

describe('resolve reference through HTTP', () => {
  it('exposes and resolves the generic Review contract', async () => {
    const system = createSystem('memory', {
      adapter: new UncertainReferenceInterpreter(),
      inference: {
        target: 'test.default',
        provider: 'test',
        model: 'test',
      },
      mode: 'write',
    });
    const server = createHttpServer(system, { signingSecret });
    const entryId = await system.capture.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'La persona hablante creó Wingman.',
      },
      origin: {
        source: 'external',
      },
    });

    await system.interpretation.processNext.execute();

    const listed = await server.inject({
      method: 'GET',
      url: '/api/reviews',
      headers: authorization,
    });
    const reviewId = listed.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    const detail = await server.inject({
      method: 'GET',
      url: `/api/reviews/${reviewId}`,
      headers: authorization,
    });

    expect(detail.json()).toMatchObject({
      kind: 'referenceResolution',
      status: 'pending',
      resolution: {
        reference: 'speaker',
        question: '¿Quién es la persona hablante?',
        candidates: [],
      },
    });
    expect(detail.json()).not.toHaveProperty('decision');

    const resolved = await server.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/resolution`,
      headers: authorization,
      payload: {
        decision: {
          reference: 'speaker',
        },
      },
    });

    expect(resolved.statusCode).toBe(204);
    expect((await system.interpretation.getEntryStatus.execute(entryId)).status).toBe('completed');

    await server.close();
  });
});

class UncertainReferenceInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'uncertain-reference',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [
          {
            reference: 'speaker',
            name: 'Persona hablante',
            definition: 'Persona que afirma haber creado Wingman',
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
            question: '¿Quién es la persona hablante?',
            candidateConceptIds: [],
          },
        ],
      },
    };
  }
}
