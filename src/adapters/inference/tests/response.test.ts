import { describe, expect, it } from 'vitest';
import { InterpreterUnavailableError } from '../../../modules/interpretation/services/interpreter.js';
import { readChatCompletionResponse, readInferenceResponse } from '../response.js';

describe('inference response errors', () => {
  it('preserves retry policy without exposing provider account details', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message:
            'Rate limit for organization `org_secret` reached. Upgrade at https://example.test/billing',
        },
      }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '12' } },
    );

    const error = await readInferenceResponse(response).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(InterpreterUnavailableError);
    expect(error).toMatchObject({
      message: 'Inference provider request failed with status 429',
      retryAfterMs: 12_000,
    });
    expect(String(error)).not.toContain('org_secret');
    expect(String(error)).not.toContain('example.test');
  });
});

describe('chat completion responses', () => {
  it('reads structured output and token usage', async () => {
    const response = new Response(
      JSON.stringify({
        model: 'gemini-3.5-flash',
        choices: [
          {
            message: {
              content: JSON.stringify({ kind: 'empty', reason: null, draft: null }),
            },
          },
        ],
        usage: { prompt_tokens: 123, completion_tokens: 17 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    await expect(readChatCompletionResponse(response)).resolves.toEqual({
      kind: 'inferenceExecution',
      output: { kind: 'empty' },
      usedModel: 'gemini-3.5-flash',
      usage: { inputTokens: 123, outputTokens: 17 },
    });
  });
});
