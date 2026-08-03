import { describe, expect, it, vi } from 'vitest';
import type { InterpretationRequest } from '../../../modules/interpretation/services/request.js';
import { createInferenceAdapter } from '../adapter.js';

describe('Gemini inference adapter', () => {
  it('uses the OpenAI-compatible chat contract with structured output', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'gemini-3.5-flash',
            choices: [
              {
                message: {
                  content: JSON.stringify({ kind: 'empty', reason: null, draft: null }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const adapter = createInferenceAdapter(
      {
        target: 'gemini.flash',
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: 'gemini-secret',
      },
      fetcher,
    );

    await adapter.interpret(request);

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(init?.headers).toEqual({
      authorization: 'Bearer gemini-secret',
      'content-type': 'application/json',
    });
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash',
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: expect.stringContaining('Interpret this Entry') },
        { role: 'user', content: expect.any(String) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'wingman_interpretation',
          strict: true,
          schema: expect.any(Object),
        },
      },
    });
  });
});

const request = {
  operation: 'interpretEntry',
  reasoning: 'low',
  instructionsVersion: 'test',
  objective: 'Interpret this Entry.',
  instructions: ['Preserve it verbatim.'],
  entry: {
    id: 'entry-1',
    content: { kind: 'text', text: 'Hola' },
    origin: { source: 'test' },
    capturedAt: '2026-08-02T00:00:00.000Z',
  },
  context: { items: [], revisions: [], componentSchemas: [], profiles: [] },
  outputContract: 'Return structured output.',
} as InterpretationRequest;
