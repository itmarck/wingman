import {
  createInferenceClient,
  ProviderError,
  RetryableProviderError,
} from '../../../packages/inference/index.js';
import type { InterpreterIdentity } from '../../modules/interpretation/domain/interpretation.js';
import {
  InferenceAdapterError,
  type InferenceExecution,
  type InterpretationAdapter,
  RetryableInferenceError,
} from '../../modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import type { InferenceAdapterConfig } from './config.js';
import { interpretationOutputSchema, parseInterpretationOutput } from './schema.js';

type Fetch = typeof globalThis.fetch;

/** Translates Wingman's Interpretation request into the generic provider client. */
export function createInferenceAdapter(
  config: InferenceAdapterConfig,
  fetcher: Fetch = globalThis.fetch,
): InterpretationAdapter {
  const client = createInferenceClient(
    {
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model,
      protocol: config.provider === 'gemini' ? 'chatCompletions' : 'responses',
    },
    fetcher,
  );
  const identity: InterpreterIdentity = Object.freeze({ key: config.target });
  return {
    identity,
    async interpret(request: InterpretationRequest): Promise<InferenceExecution> {
      try {
        const result = await client.execute({
          instructions: instructions(request),
          input: JSON.stringify({
            operation: request.operation,
            entry: request.entry,
            context: request.context,
          }),
          reasoning: request.reasoning,
          schema: interpretationOutputSchema,
          schemaName: 'wingman_interpretation',
        });
        const output = parseInterpretationOutput(result.output);
        if (!output)
          throw new RetryableInferenceError(
            'invalidResponse',
            'Inference provider output does not match the Interpretation schema',
          );
        return Object.freeze({
          kind: 'inferenceExecution',
          output,
          usedModel: result.usedModel,
          usage: result.usage,
        });
      } catch (error) {
        if (error instanceof RetryableInferenceError) throw error;
        if (error instanceof RetryableProviderError)
          throw new RetryableInferenceError(error.retryClass, error.message, error.retryAfterMs);
        if (error instanceof ProviderError)
          throw new InferenceAdapterError(error.category, error.message);
        throw error;
      }
    },
  };
}

function instructions(request: InterpretationRequest): string {
  return [
    ...request.policies,
    request.outputContract,
    'Return only the structured result described by the supplied JSON schema.',
  ].join('\n');
}
