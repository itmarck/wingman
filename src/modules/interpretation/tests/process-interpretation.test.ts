import { describe, expect, it } from 'vitest';
import { defaultProcessingConfig } from '../config.js';
import {
  type InterpretationAdapter,
  InterpreterUnavailableError,
} from '../services/interpreter.js';
import type { InterpretationRequest } from '../services/request.js';
import { createInterpretationTestSystem as createMemoryApplication } from './support.js';

describe('asynchronous Entry processing', () => {
  it('uses the agreed processing timing defaults', () => {
    expect(defaultProcessingConfig).toMatchObject({
      leaseDurationMs: 300_000,
      leaseRenewalIntervalMs: 60_000,
      retryDelaysMs: [60_000, 180_000],
    });
  });

  it('interprets queued work independently from capture', async () => {
    const application = createMemoryApplication(new KnowledgeInterpreter());
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Wingman preserves original information.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-knowledge',
      },
    });

    expect((await application.queries.getInterpretation.execute(entryId)).status).toBe('queued');
    expect(await application.queries.readProjection.execute('system.currentAxioms')).toMatchObject({
      data: {
        axioms: [],
      },
    });

    expect(await application.commands.processNext.execute()).toBe(true);

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'completed',
      attempts: 1,
      publication: {
        conceptIds: expect.any(Array),
        predicateIds: expect.any(Array),
        axiomIds: expect.any(Array),
        linkIds: [],
      },
    });
    expect(
      (await application.queries.getInterpretation.execute(entryId)).publication?.axiomIds,
    ).toHaveLength(1);
    expect(await application.queries.readProjection.execute('system.currentAxioms')).toMatchObject({
      data: {
        axioms: [{ entryId }],
      },
    });
    expect(await application.commands.processNext.execute()).toBe(false);
  });

  it('records failures and processes an explicit retry', async () => {
    const interpreter = new RecoveringInterpreter();
    const application = createMemoryApplication(interpreter);
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Retry this interpretation.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-retry',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Interpreter unavailable',
    );

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'Interpreter unavailable',
    });

    interpreter.recover();
    await application.commands.retryEntry.execute(entryId);
    await application.commands.processNext.execute();

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'completed',
      attempts: 2,
    });
  });

  it('reschedules recoverable failures and exhausts the third attempt', async () => {
    const application = createMemoryApplication(new FailingInterpreter(), {
      ...defaultProcessingConfig,
      retryDelaysMs: [0, 0],
    });
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Retry temporary failures automatically.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-exhausted',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Remote interpreter unavailable',
    );
    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'queued',
      attempts: 1,
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Remote interpreter unavailable',
    );
    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'queued',
      attempts: 2,
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Remote interpreter unavailable',
    );
    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'exhausted',
      attempts: 3,
      error: 'Remote interpreter unavailable',
    });

    await application.commands.retryEntry.execute(entryId);
    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'queued',
      attempts: 3,
    });
  });

  it('leaves temporary failures to queue retries without changing Interpreter', async () => {
    const application = createMemoryApplication(new FailingInterpreter(), {
      ...defaultProcessingConfig,
      retryDelaysMs: [60_000],
    });
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Use the available interpreter.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-unavailable',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Remote interpreter unavailable',
    );

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'queued',
      attempts: 1,
    });
  });

  it('honors a provider retry delay while preserving the configured attempt limit', async () => {
    const application = createMemoryApplication(new RetryAfterInterpreter(), {
      ...defaultProcessingConfig,
      retryDelaysMs: [60_000],
    });
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Reintentar cuando el proveedor vuelva a estar disponible.',
      },
      origin: {
        source: 'test',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow('Rate limited');
    const interpretation = await application.queries.getInterpretation.execute(entryId);

    expect(interpretation.status).toBe('queued');
    expect(
      Date.parse(interpretation.availableAt ?? '') - Date.parse(interpretation.updatedAt),
    ).toBe(2_750);
  });

  it('creates a new historical Interpretation with the configured operation adapter', async () => {
    const application = createMemoryApplication(new KnowledgeInterpreter());
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Interpret this entry again.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-reinterpret',
      },
    });

    await application.commands.processNext.execute();
    const interpretationId = await application.commands.reinterpretEntry.execute({
      entryId,
    });
    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Interpretation Draft does not produce new knowledge',
    );

    const history = await application.queries.listInterpretations.execute(entryId);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      status: 'completed',
    });
    expect(history[1]).toMatchObject({
      id: interpretationId,
      status: 'failed',
      interpreter: {
        key: 'knowledge',
      },
      error: 'Interpretation Draft does not produce new knowledge',
    });
  });

  it('does not hide programming errors', async () => {
    const application = createMemoryApplication(new InvalidInterpreter());

    await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Do not mask this failure.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-invalid-interpreter',
      },
    });

    await expect(application.commands.processNext.execute()).rejects.toThrow(
      'Invalid adapter implementation',
    );
  });

  it('derives human intervention from a pending Review instead of processing state', async () => {
    const application = createMemoryApplication(new RustInterpreter());

    await application.commands.registerConcept.execute({
      name: 'Rust',
      aliases: ['Rust language'],
      definition: 'Programming language',
    });
    await application.commands.registerConcept.execute({
      name: 'Rust',
      aliases: ['Rust game'],
      definition: 'Survival video game',
    });

    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'I want to learn Rust.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-rust',
      },
    });

    await application.commands.processNext.execute();

    const reviews = await application.queries.listReviews.execute();

    expect((await application.queries.getInterpretation.execute(entryId)).status).toBe('pending');
    expect(await application.queries.getEntryStatus.execute(entryId)).toMatchObject({
      status: 'pending',
      reviewIds: [reviews.items[0]?.id],
    });
    expect(reviews.items).toHaveLength(1);
    expect((await application.queries.getReview.execute(reviews.items[0]?.id ?? '')).entryId).toBe(
      entryId,
    );
  });

  it('completes an explicit empty result without publishing knowledge', async () => {
    const application = createMemoryApplication(new EmptyInterpreter());
    const entryId = await application.commands.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'A transient instruction without durable knowledge.',
      },
      origin: {
        source: 'minima',
        externalId: 'entry-empty',
      },
    });

    await application.commands.processNext.execute();

    expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
      status: 'completed',
      interpreter: {
        key: 'empty',
      },
      publication: {
        conceptIds: [],
        predicateIds: [],
        axiomIds: [],
        linkIds: [],
      },
    });
    expect(await currentAxioms(application)).toEqual([]);
  });

  it('fails closed when knowledge is empty or the output contract is malformed', async () => {
    for (const [externalId, interpreter] of [
      ['empty-knowledge', new EmptyKnowledgeInterpreter()],
      ['malformed-output', new MalformedInterpreter()],
    ] as const) {
      const application = createMemoryApplication(interpreter);
      const entryId = await application.commands.captureEntry.execute({
        content: {
          kind: 'text',
          text: 'Do not infer a valid empty result from this output.',
        },
        origin: {
          source: 'minima',
          externalId,
        },
      });

      await expect(application.commands.processNext.execute()).rejects.toThrow();
      expect(await application.queries.getInterpretation.execute(entryId)).toMatchObject({
        status: 'failed',
        interpreter: {
          key: externalId,
        },
      });
      expect(await currentAxioms(application)).toEqual([]);
    }
  });
});

class KnowledgeInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'knowledge',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [
          {
            reference: 'wingman',
            name: 'Wingman',
            definition: 'Personal knowledge and automation system',
          },
        ],
        predicates: [
          {
            key: 'preserves',
            definition: 'Indicates information that remains unchanged',
            origin: 'custom',
            scope: 'axiom',
          },
        ],
        axioms: [
          {
            reference: 'preservation',
            subjectReference: 'wingman',
            predicateKey: 'preserves',
            object: {
              kind: 'literal',
              literal: {
                kind: 'text',
                value: 'Original information',
              },
            },
          },
        ],
      },
    };
  }
}

class RecoveringInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'recovering',
  });

  #available = false;

  recover(): void {
    this.#available = true;
  }

  async interpret() {
    if (!this.#available) {
      throw new Error('Interpreter unavailable');
    }

    return {
      kind: 'empty',
    };
  }
}

class RustInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'rust',
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
        predicates: [],
        axioms: [],
      },
    };
  }
}

class FailingInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'remote-powerful',
  });

  async interpret(): Promise<never> {
    throw new InterpreterUnavailableError('Remote interpreter unavailable');
  }
}

class RetryAfterInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'retry-after',
  });

  async interpret(): Promise<never> {
    throw new InterpreterUnavailableError('Rate limited', 2_750);
  }
}

class EmptyInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'empty',
  });

  async interpret() {
    return {
      kind: 'empty',
    };
  }
}

class InvalidInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'invalid',
  });

  async interpret(): Promise<never> {
    throw new Error('Invalid adapter implementation');
  }
}

class EmptyKnowledgeInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'empty-knowledge',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        concepts: [],
        predicates: [],
        axioms: [],
      },
    };
  }
}

class MalformedInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'malformed-output',
  });

  async interpret() {
    return {
      concepts: [],
    };
  }
}

async function currentAxioms(application: ReturnType<typeof createMemoryApplication>) {
  const projection = await application.queries.readProjection.execute('system.currentAxioms');

  return projection.data.axioms;
}
