import { describe, expect, it } from 'vitest';
import { ProviderError, RetryableProviderError } from './errors.js';
import { readChatCompletionResponse, readResponsesResponse } from './response.js';

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

    const error = await readResponsesResponse(response).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(RetryableProviderError);
    expect(error).toMatchObject({
      message: 'Inference provider request failed with status 429',
      retryClass: 'quota',
      retryAfterMs: 12_000,
    });
    expect(String(error)).not.toContain('org_secret');
    expect(String(error)).not.toContain('example.test');
  });

  it('distinguishes outages, invalid output and authentication', async () => {
    const outage = await readResponsesResponse(new Response('{}', { status: 503 })).catch(
      (value: unknown) => value,
    );
    const invalid = await readResponsesResponse(
      new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }),
    ).catch((value: unknown) => value);
    const authentication = await readResponsesResponse(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    ).catch((value: unknown) => value);

    expect(outage).toMatchObject({ retryClass: 'transient', category: 'unavailable' });
    expect(invalid).toMatchObject({ retryClass: 'invalidResponse', category: 'invalidResponse' });
    expect(authentication).toBeInstanceOf(ProviderError);
    expect(authentication).not.toBeInstanceOf(RetryableProviderError);
    expect(authentication).toMatchObject({ category: 'authentication' });
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
      output: { kind: 'empty', reason: null, draft: null },
      usedModel: 'gemini-3.5-flash',
      usage: { inputTokens: 123, outputTokens: 17 },
    });
  });
});
