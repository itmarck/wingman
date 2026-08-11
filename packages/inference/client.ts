import { RetryableProviderError } from './errors.js';
import { readChatCompletionResponse, readResponsesResponse } from './response.js';
import type {
  InferenceClientConfig,
  ProviderExecution,
  StructuredInferenceRequest,
} from './types.js';

type Fetch = typeof globalThis.fetch;

export interface InferenceClient {
  execute(request: StructuredInferenceRequest): Promise<ProviderExecution>;
}

/** Creates one provider-protocol client without application-domain knowledge. */
export function createInferenceClient(
  config: InferenceClientConfig,
  fetcher: Fetch = globalThis.fetch,
): InferenceClient {
  return {
    async execute(request) {
      let response: Response;
      try {
        response = await fetcher(config.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body(config, request)),
          signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
        });
      } catch (error) {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
        throw new RetryableProviderError(
          'transient',
          'unavailable',
          `Inference provider is unavailable${detail}`,
        );
      }
      return config.protocol === 'chatCompletions'
        ? readChatCompletionResponse(response)
        : readResponsesResponse(response);
    },
  };
}

function body(config: InferenceClientConfig, request: StructuredInferenceRequest) {
  if (config.protocol === 'chatCompletions')
    return {
      model: config.model,
      messages: [
        { role: 'system', content: request.instructions },
        { role: 'user', content: request.input },
      ],
      reasoning_effort: request.reasoning,
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      },
    };
  return {
    model: config.model,
    instructions: request.instructions,
    input: request.input,
    reasoning: { effort: request.reasoning },
    text: {
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
  };
}
