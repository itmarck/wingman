import { describe, expect, it, vi } from 'vitest';
import {
  InferenceAdapterError,
  InterpreterUnavailableError,
} from '../../../modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../../modules/interpretation/services/request.js';
import { createInferenceAdapter } from '../adapter.js';
import type { InferenceAdapterConfig } from '../config.js';

const request: InterpretationRequest = Object.freeze({
  operation: 'interpretEntry',
  reasoning: 'low',
  instructionsVersion: 'interpretEntry.v1',
  objective: 'Interpret one Entry as durable structured knowledge.',
  instructions: Object.freeze(['Preserve the meaning of the Entry.']),
  entry: Object.freeze({
    id: 'entry-1',
    content: Object.freeze({
      kind: 'text',
      text: 'Wingman preserves knowledge.',
    }),
    origin: Object.freeze({
      source: 'browser',
    }),
    capturedAt: '2026-07-28T12:00:00.000Z',
  }),
  context: Object.freeze({
    concepts: Object.freeze([]),
    predicates: Object.freeze([]),
    axioms: Object.freeze([]),
  }),
  outputContract: 'Return knowledge, empty, or invalid.',
});

describe('HTTP inference Adapter', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/responses'],
    ['groq', 'https://api.groq.com/openai/v1/responses'],
  ] as const)(
    'calls the %s Responses API with the strict provider-independent contract',
    async (provider, url) => {
      const fetcher = createFetch(
        completedResponse(
          {
            kind: 'empty',
            reason: null,
            draft: null,
          },
          {
            model: 'used-model',
            usage: {
              input_tokens: 20,
              output_tokens: 3,
            },
          },
        ),
      );
      const adapter = createInferenceAdapter(createConfig(provider), fetcher);

      await expect(adapter.interpret(request)).resolves.toEqual({
        kind: 'inferenceExecution',
        output: {
          kind: 'empty',
        },
        usedModel: 'used-model',
        usage: {
          inputTokens: 20,
          outputTokens: 3,
        },
      });
      expect(adapter.identity).toEqual({
        key: `${provider}.target`,
      });

      const [calledUrl, init] = vi.mocked(fetcher).mock.calls[0];
      const body = JSON.parse(String(init?.body));

      expect(calledUrl).toBe(url);
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          authorization: 'Bearer provider-secret',
          'content-type': 'application/json',
        },
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(body).toMatchObject({
        model: 'requested-model',
        reasoning: {
          effort: 'low',
        },
        text: {
          format: {
            type: 'json_schema',
            name: 'wingman_interpretation',
            strict: true,
          },
        },
      });
      expect(body.text.format.schema).toHaveProperty('$defs.Draft');
      expect(body.text.format.schema).toHaveProperty(
        '$defs.Predicate.properties.key.pattern',
        '^(?:[a-z][A-Za-z0-9]*|system\\.[a-z][A-Za-z0-9]*)$',
      );
      expect(JSON.stringify(body.text.format.schema)).not.toContain('"oneOf"');
      expect(JSON.parse(body.input)).toEqual({
        operation: 'interpretEntry',
        entry: request.entry,
        context: request.context,
      });
    },
  );

  it('returns locally validated knowledge', async () => {
    const draft = {
      entryId: 'entry-1',
      concepts: [
        {
          reference: 'wingman',
          name: 'Wingman',
          aliases: [],
          definition: 'A personal knowledge server.',
        },
      ],
      predicates: [
        {
          key: 'isDescribedAs',
          definition: 'Describes a concept.',
          origin: 'custom',
          scope: 'axiom',
          mode: 'descriptive',
        },
      ],
      axioms: [
        {
          reference: 'wingman-description',
          subjectReference: 'wingman',
          predicateKey: 'isDescribedAs',
          object: {
            kind: 'literal',
            literal: {
              kind: 'text',
              value: 'A personal knowledge server.',
            },
          },
          sourceLocators: [],
        },
      ],
      links: [],
      referenceResolutions: [],
    };
    const adapter = createInferenceAdapter(
      createConfig('openai'),
      createFetch(
        completedResponse({
          kind: 'knowledge',
          reason: null,
          draft,
        }),
      ),
    );

    await expect(adapter.interpret(request)).resolves.toMatchObject({
      output: {
        kind: 'knowledge',
        draft,
      },
    });
  });

  it.each([
    [429, 'Rate limit reached'],
    [500, 'Provider unavailable'],
  ])('classifies transient HTTP %s failures as unavailable', async (status, message) => {
    const adapter = createInferenceAdapter(
      createConfig('openai'),
      createFetch(errorResponse(status, message)),
    );

    await expect(adapter.interpret(request)).rejects.toMatchObject({
      category: 'unavailable',
      message: expect.stringContaining(message),
    });
  });

  it('classifies rejected credentials without scheduling a transient retry', async () => {
    const adapter = createInferenceAdapter(
      createConfig('groq'),
      createFetch(errorResponse(401, 'Invalid API key')),
    );
    const error = await adapter.interpret(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InferenceAdapterError);
    expect(error).not.toBeInstanceOf(InterpreterUnavailableError);
    expect(error).toMatchObject({
      category: 'authentication',
      message: expect.stringContaining('Invalid API key'),
    });
  });

  it('classifies transport failures and timeouts as unavailable', async () => {
    for (const failure of [
      new TypeError('fetch failed'),
      new DOMException('The operation timed out', 'TimeoutError'),
    ]) {
      const fetcher = vi.fn(async () => {
        throw failure;
      }) as unknown as typeof fetch;
      const adapter = createInferenceAdapter(createConfig('openai'), fetcher);

      await expect(adapter.interpret(request)).rejects.toThrow(InterpreterUnavailableError);
    }
  });

  it('retries generated JSON validation failures without retrying malformed requests', async () => {
    const generated = createInferenceAdapter(
      createConfig('groq'),
      createFetch(
        jsonResponse(
          {
            error: {
              code: 'json_validate_failed',
              message: 'Generated JSON does not match the expected schema',
            },
          },
          400,
        ),
      ),
    );
    const malformed = createInferenceAdapter(
      createConfig('groq'),
      createFetch(errorResponse(400, 'The request body is invalid')),
    );

    await expect(generated.interpret(request)).rejects.toThrow(InterpreterUnavailableError);
    await expect(malformed.interpret(request)).rejects.toMatchObject({
      category: 'request',
    });
  });

  it('preserves incomplete and refusal outcomes instead of reporting missing output', async () => {
    const incomplete = createInferenceAdapter(
      createConfig('openai'),
      createFetch(
        jsonResponse({
          status: 'incomplete',
          incomplete_details: {
            reason: 'max_output_tokens',
          },
        }),
      ),
    );
    const refusal = createInferenceAdapter(
      createConfig('openai'),
      createFetch(
        jsonResponse({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'refusal',
                  refusal: 'Cannot process this content',
                },
              ],
            },
          ],
        }),
      ),
    );

    await expect(incomplete.interpret(request)).rejects.toMatchObject({
      category: 'incomplete',
      message: expect.stringContaining('max_output_tokens'),
    });
    await expect(refusal.interpret(request)).rejects.toMatchObject({
      category: 'refusal',
      message: expect.stringContaining('Cannot process this content'),
    });
  });

  it('omits unavailable model and usage metadata so Interpreter can apply its fallback', async () => {
    const adapter = createInferenceAdapter(
      createConfig('openai'),
      createFetch(
        completedResponse({
          kind: 'empty',
          reason: null,
          draft: null,
        }),
      ),
    );

    await expect(adapter.interpret(request)).resolves.toEqual({
      kind: 'inferenceExecution',
      output: {
        kind: 'empty',
      },
      usedModel: undefined,
      usage: undefined,
    });
  });

  it('rejects successful responses with invalid JSON or schema', async () => {
    const invalidJson = createInferenceAdapter(
      createConfig('openai'),
      createFetch(outputTextResponse('not-json')),
    );
    const invalidSchema = createInferenceAdapter(
      createConfig('openai'),
      createFetch(outputTextResponse(JSON.stringify({ kind: 'empty' }))),
    );

    await expect(invalidJson.interpret(request)).rejects.toMatchObject({
      category: 'invalidResponse',
      message: 'Inference provider returned invalid JSON',
    });
    await expect(invalidSchema.interpret(request)).rejects.toMatchObject({
      category: 'invalidResponse',
      message: 'Inference provider output does not match the Interpretation schema',
    });
  });
});

function createConfig(provider: 'groq' | 'openai'): InferenceAdapterConfig {
  return {
    target: `${provider}.target`,
    provider,
    model: 'requested-model',
    endpoint:
      provider === 'openai'
        ? 'https://api.openai.com/v1/responses'
        : 'https://api.groq.com/openai/v1/responses',
    apiKey: 'provider-secret',
  };
}

function createFetch(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

function completedResponse(
  output: unknown,
  metadata: {
    readonly model?: string;
    readonly usage?: object;
  } = {},
): Response {
  return jsonResponse({
    status: 'completed',
    ...metadata,
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(output),
          },
        ],
      },
    ],
  });
}

function outputTextResponse(text: string): Response {
  return jsonResponse({
    status: 'completed',
    output: [
      {
        content: [
          {
            type: 'output_text',
            text,
          },
        ],
      },
    ],
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse(
    {
      error: {
        message,
      },
    },
    status,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}
