import { ProviderError, RetryableProviderError } from './errors.js';
import type { ProviderExecution } from './types.js';

export async function readResponsesResponse(response: Response): Promise<ProviderExecution> {
  const body = await readBody(response);
  if (!response.ok) throwHttpError(response, body);
  if (!isRecord(body)) throw invalid('Inference provider returned a non-object response');
  assertCompleted(body);
  const refusal = readRefusal(body.output);
  if (refusal)
    throw new ProviderError('refusal', `Inference provider refused the request: ${refusal}`);
  const text = readOutputText(body.output);
  if (!text) throw invalid('Inference provider returned no output text');
  return execution(parseJson(text), body.model, body.usage, 'input_tokens', 'output_tokens');
}

export async function readChatCompletionResponse(response: Response): Promise<ProviderExecution> {
  const body = await readBody(response);
  if (!response.ok) throwHttpError(response, body);
  if (!isRecord(body)) throw invalid('Inference provider returned a non-object response');
  if (isRecord(body.error)) throwProviderFailure(body.error);
  const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
  const refusal = message ? optionalString(message.refusal) : undefined;
  if (refusal)
    throw new ProviderError('refusal', `Inference provider refused the request: ${refusal}`);
  const text = message ? optionalString(message.content) : undefined;
  if (!text) throw invalid('Inference provider returned no output text');
  return execution(parseJson(text), body.model, body.usage, 'prompt_tokens', 'completion_tokens');
}

function execution(
  output: unknown,
  model: unknown,
  rawUsage: unknown,
  inputKey: string,
  outputKey: string,
): ProviderExecution {
  const usage = isRecord(rawUsage) ? rawUsage : {};
  const inputTokens = optionalNumber(usage[inputKey]);
  const outputTokens = optionalNumber(usage[outputKey]);
  return Object.freeze({
    output,
    usedModel: optionalString(model),
    usage:
      inputTokens === undefined && outputTokens === undefined
        ? undefined
        : Object.freeze({ inputTokens, outputTokens }),
  });
}

function assertCompleted(response: Record<string, unknown>): void {
  if (isRecord(response.error)) throwProviderFailure(response.error);
  if (response.status === undefined || response.status === 'completed') return;
  if (response.status === 'in_progress')
    throw new RetryableProviderError(
      'transient',
      'unavailable',
      'Inference provider response is still in progress',
    );
  if (response.status === 'failed')
    throw new ProviderError('provider', 'Inference provider failed to create a response');
  if (response.status === 'incomplete') {
    const details = isRecord(response.incomplete_details) ? response.incomplete_details : {};
    throw invalid(
      `Inference provider returned an incomplete response: ${optionalString(details.reason) ?? 'unknown reason'}`,
    );
  }
  throw invalid(`Inference provider returned unknown status ${String(response.status)}`);
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
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content)
      if (isRecord(content) && content.type === type) return content;
  }
  return undefined;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (!response.ok) return undefined;
    throw invalid('Inference provider returned a non-JSON response');
  }
}

function throwHttpError(response: Response, body: unknown): never {
  const detail = response.status === 429 || response.status >= 500 ? undefined : safeMessage(body);
  const message = `Inference provider request failed with status ${response.status}${detail ? `: ${detail}` : ''}`;
  if (response.status === 429)
    throw new RetryableProviderError(
      'quota',
      'unavailable',
      message,
      retryAfterMs(response.headers),
    );
  if (response.status === 408 || response.status === 409 || response.status >= 500)
    throw new RetryableProviderError(
      'transient',
      'unavailable',
      message,
      retryAfterMs(response.headers),
    );
  throw new ProviderError(
    response.status === 401 || response.status === 403 ? 'authentication' : 'request',
    message,
  );
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

function throwProviderFailure(error: Record<string, unknown>): never {
  const message = safeMessage(error) ?? 'Inference provider failed to create a response';
  const code = optionalString(error.code)?.toLowerCase() ?? '';
  if (['rate_limit', 'quota'].some((value) => code.includes(value)))
    throw new RetryableProviderError('quota', 'unavailable', message);
  if (['server_error', 'timeout', 'unavailable'].some((value) => code.includes(value)))
    throw new RetryableProviderError('transient', 'unavailable', message);
  throw new ProviderError('provider', message);
}

function safeMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = isRecord(value.error) ? value.error : value;
  return optionalString(error.message)
    ?.replace(/organization\s+`[^`]+`/gi, 'organization [redacted]')
    .replace(/https?:\/\/\S+/gi, '[link redacted]')
    .slice(0, 300);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid('Inference provider returned invalid JSON');
  }
}

function invalid(message: string): RetryableProviderError {
  return new RetryableProviderError('invalidResponse', 'invalidResponse', message);
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
