import type { InterpreterIdentity } from '../../modules/interpretation/domain/interpretation.js';
import {
  type InferenceExecution,
  type InterpretationAdapter,
  InterpreterUnavailableError,
} from '../../modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import type { InferenceAdapterConfig } from './config.js';
import { readInferenceResponse } from './response.js';
import { interpretationOutputSchema } from './schema.js';

type Fetch = typeof globalThis.fetch;

const inferenceTimeoutMs = 60_000;

/**
 * Creates the configured remote Interpreter without exposing provider details to the system.
 */
export function createInferenceAdapter(
  config: InferenceAdapterConfig,
  fetcher: Fetch = globalThis.fetch,
): InterpretationAdapter {
  return new HttpInferenceAdapter(config, fetcher);
}

class HttpInferenceAdapter implements InterpretationAdapter {
  readonly identity: InterpreterIdentity;

  constructor(
    private readonly config: InferenceAdapterConfig,
    private readonly fetcher: Fetch,
  ) {
    this.identity = Object.freeze({
      key: config.target,
    });
  }

  async interpret(request: InterpretationRequest): Promise<InferenceExecution> {
    let response: Response;

    try {
      response = await this.fetcher(this.config.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(createRequestBody(this.config, request)),
        signal: AbortSignal.timeout(inferenceTimeoutMs),
      });
    } catch (error) {
      throw unavailable(error);
    }

    return readInferenceResponse(response);
  }
}

function createRequestBody(config: InferenceAdapterConfig, request: InterpretationRequest) {
  return {
    model: config.model,
    instructions: [
      request.objective,
      ...request.instructions,
      request.outputContract,
      'Return only the structured result described by the supplied JSON schema.',
    ].join('\n'),
    input: JSON.stringify({
      operation: request.operation,
      entry: request.entry,
      context: request.context,
      predicateUsage: request.predicateUsage,
    }),
    reasoning: {
      effort: request.reasoning,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'wingman_interpretation',
        strict: true,
        schema: interpretationOutputSchema,
      },
    },
  };
}

function unavailable(error: unknown): InterpreterUnavailableError {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : '';

  return new InterpreterUnavailableError(`Inference provider is unavailable${detail}`);
}
