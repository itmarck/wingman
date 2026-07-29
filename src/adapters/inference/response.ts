import {
  InferenceAdapterError,
  type InferenceExecution,
  InterpreterUnavailableError,
} from '../../modules/interpretation/services/interpreter.js';
import { parseInterpretationOutput } from './schema.js';

/**
 * Reads one Responses API result and preserves provider failure semantics.
 */
export async function readInferenceResponse(response: Response): Promise<InferenceExecution> {
  const body = await readBody(response);

  if (!response.ok) {
    throwHttpError(response.status, body);
  }

  return parseResponse(body);
}

function parseResponse(value: unknown): InferenceExecution {
  if (!isRecord(value)) {
    throw invalidResponse('Inference provider returned a non-object response');
  }

  assertCompletedResponse(value);

  const refusal = readRefusal(value.output);

  if (refusal) {
    throw new InferenceAdapterError(
      'refusal',
      `Inference provider refused the request: ${refusal}`,
    );
  }

  const text = readOutputText(value.output);

  if (!text) {
    throw invalidResponse('Inference provider returned no output text');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidResponse('Inference provider returned invalid JSON');
  }

  const output = parseInterpretationOutput(parsed);

  if (!output) {
    throw invalidResponse('Inference provider output does not match the Interpretation schema');
  }

  const usage = isRecord(value.usage) ? value.usage : {};
  const inputTokens = optionalNumber(usage.input_tokens);
  const outputTokens = optionalNumber(usage.output_tokens);

  return Object.freeze({
    kind: 'inferenceExecution',
    output,
    usedModel: optionalString(value.model),
    usage:
      inputTokens === undefined && outputTokens === undefined
        ? undefined
        : Object.freeze({
            inputTokens,
            outputTokens,
          }),
  });
}

function assertCompletedResponse(response: Record<string, unknown>): void {
  if (isRecord(response.error)) {
    throwProviderFailure(response.error);
  }

  if (response.status === undefined || response.status === 'completed') {
    return;
  }

  if (response.status === 'in_progress') {
    throw new InterpreterUnavailableError('Inference provider response is still in progress');
  }

  if (response.status === 'failed') {
    throw new InferenceAdapterError('provider', 'Inference provider failed to create a response');
  }

  if (response.status === 'incomplete') {
    const details = isRecord(response.incomplete_details) ? response.incomplete_details : {};
    const reason = optionalString(details.reason) ?? 'unknown reason';

    throw new InferenceAdapterError(
      'incomplete',
      `Inference provider returned an incomplete response: ${reason}`,
    );
  }

  throw invalidResponse(`Inference provider returned unknown status ${String(response.status)}`);
}

function readOutputText(output: unknown): string | undefined {
  const content = findContent(output, 'output_text');

  return content && typeof content.text === 'string' ? content.text : undefined;
}

function readRefusal(output: unknown): string | undefined {
  const content = findContent(output, 'refusal');

  return content ? (optionalString(content.refusal) ?? 'No reason was provided') : undefined;
}

function findContent(output: unknown, type: string): Record<string, unknown> | undefined {
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && content.type === type) {
        return content;
      }
    }
  }

  return undefined;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (!response.ok) {
      return undefined;
    }

    throw invalidResponse('Inference provider returned a non-JSON response');
  }
}

function throwHttpError(status: number, body: unknown): never {
  const detail = readProviderMessage(body);
  const message = `Inference provider request failed with status ${status}${detail ? `: ${detail}` : ''}`;
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    isGeneratedOutputFailure(body);

  if (retryable) {
    throw new InterpreterUnavailableError(message);
  }

  const category = status === 401 || status === 403 ? 'authentication' : 'request';

  throw new InferenceAdapterError(category, message);
}

function throwProviderFailure(error: Record<string, unknown>): never {
  const message = readProviderMessage(error) ?? 'Inference provider failed to create a response';
  const code = optionalString(error.code)?.toLowerCase() ?? '';
  const transient = ['rate_limit', 'server_error', 'timeout', 'unavailable'].some((value) =>
    code.includes(value),
  );

  if (transient) {
    throw new InterpreterUnavailableError(message);
  }

  throw new InferenceAdapterError('provider', message);
}

function isGeneratedOutputFailure(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const error = isRecord(value.error) ? value.error : value;
  const code = optionalString(error.code)?.toLowerCase() ?? '';
  const message = optionalString(error.message)?.toLowerCase() ?? '';

  return (
    'failed_generation' in error ||
    code.includes('json_validate') ||
    (message.includes('generated json') && message.includes('schema'))
  );
}

function readProviderMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const error = isRecord(value.error) ? value.error : value;

  return optionalString(error.message)?.slice(0, 500);
}

function invalidResponse(message: string): InferenceAdapterError {
  return new InferenceAdapterError('invalidResponse', message);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
