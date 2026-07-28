import type { Entry } from '../../../core/knowledge/entry.js';
import type { RegisterInterpretationInput } from '../domain/input.js';
import type { InterpreterIdentity } from '../domain/interpretation.js';
import type { InferenceResult, InferenceRun, InferenceTelemetry } from '../ports/telemetry.js';
import type { InterpretationContext } from './context.js';
import { createInterpretationRequest, type InterpretationRequest } from './request.js';

export type InterpretationAdapterOutput =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'knowledge'; readonly draft: RegisterInterpretationInput };

/**
 * Adapter boundary that executes one provider-independent Interpretation request.
 */
export interface InterpretationAdapter {
  readonly identity: InterpreterIdentity;
  interpret(request: InterpretationRequest): Promise<unknown>;
}

export interface InferenceConfig {
  readonly target: string;
  readonly provider: string;
  readonly model: string;
}

export interface InferenceUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
}

export interface InferenceExecution {
  readonly kind: 'inferenceExecution';
  readonly output: unknown;
  readonly usedModel?: string;
  readonly usage?: InferenceUsage;
}

export interface InterpretationExecution {
  readonly interpretationId: string;
  readonly attempt: number;
}

export type InterpretationResult =
  | {
      readonly kind: 'empty';
      readonly interpreter: InterpreterIdentity;
    }
  | {
      readonly kind: 'invalid';
      readonly interpreter: InterpreterIdentity;
      readonly reason: string;
      readonly draft?: RegisterInterpretationInput;
    }
  | {
      readonly kind: 'knowledge';
      readonly interpreter: InterpreterIdentity;
      readonly draft: RegisterInterpretationInput;
    };

/**
 * Provider failure with a stable category suitable for technical telemetry.
 */
export class InferenceAdapterError extends Error {
  constructor(
    readonly category: string,
    message: string,
  ) {
    super(message);
    this.name = 'InferenceAdapterError';
  }
}

/**
 * Signals a temporary provider failure that can be retried by the queue.
 */
export class InterpreterUnavailableError extends InferenceAdapterError {
  constructor(message: string) {
    super('unavailable', message);
    this.name = 'InterpreterUnavailableError';
  }
}

/**
 * Represents a completed adapter call whose output cannot be accepted as an Interpretation.
 */
export class InvalidInterpretationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInterpretationError';
  }
}

/**
 * Executes the single configured Interpreter and records best-effort technical telemetry.
 */
export class Interpreter {
  constructor(
    private readonly adapter: InterpretationAdapter,
    private readonly config: InferenceConfig,
    private readonly telemetry?: InferenceTelemetry,
  ) {}

  async execute(
    entry: Entry,
    context: InterpretationContext,
    execution: InterpretationExecution,
  ): Promise<InterpretationResult> {
    const request = createInterpretationRequest(entry, context);
    const startedAt = new Date();
    const started = performance.now();

    try {
      const adapterResult = await this.adapter.interpret(request);
      const inference = unwrapExecution(adapterResult, this.config.model);
      const result = parseOutput(inference.output, request.entry.id);

      await this.record({
        ...createRun(request, execution, this.config, startedAt, started, result.kind),
        usedModel: inference.usedModel,
        ...inference.usage,
      });

      return Object.freeze({
        ...result,
        interpreter: Object.freeze({ ...this.adapter.identity }),
      });
    } catch (error) {
      await this.record({
        ...createRun(request, execution, this.config, startedAt, started, 'error'),
        usedModel: this.config.model,
        errorCategory: categorizeError(error),
      });
      throw error;
    }
  }

  private async record(run: InferenceRun): Promise<void> {
    try {
      await this.telemetry?.record(Object.freeze(run));
    } catch {
      // Telemetry must never change the functional Interpretation result.
    }
  }
}

function parseOutput(value: unknown, entryId: string): InterpretationAdapterOutput {
  if (!isRecord(value)) {
    return invalidOutput('Interpreter output must be an object');
  }

  if (value.kind === 'empty') {
    return Object.freeze({ kind: 'empty' });
  }

  if (value.kind === 'invalid') {
    return typeof value.reason === 'string' && value.reason.trim().length > 0
      ? Object.freeze({ kind: 'invalid', reason: value.reason.trim() })
      : invalidOutput('Invalid Interpreter output requires a reason');
  }

  if (value.kind === 'knowledge') {
    if (!isDraft(value.draft)) {
      return invalidOutput('Knowledge Interpreter output requires a valid Draft structure');
    }

    if (value.draft.entryId !== entryId) {
      return invalidOutput('Knowledge Interpreter output references a different Entry');
    }

    const hasKnowledge =
      value.draft.concepts.length > 0 ||
      value.draft.predicates.length > 0 ||
      value.draft.axioms.length > 0 ||
      (value.draft.links?.length ?? 0) > 0;

    return hasKnowledge
      ? Object.freeze({
          kind: 'knowledge',
          draft: value.draft,
        })
      : invalidOutput('Knowledge Interpreter output is empty; return empty explicitly');
  }

  return invalidOutput('Interpreter output kind must be knowledge, empty, or invalid');
}

function invalidOutput(reason: string): InterpretationAdapterOutput {
  return Object.freeze({
    kind: 'invalid',
    reason,
  });
}

function unwrapExecution(value: unknown, requestedModel: string): RequiredModelExecution {
  if (!isInferenceExecution(value)) {
    return {
      output: value,
      usedModel: requestedModel,
    };
  }

  return {
    output: value.output,
    usedModel: value.usedModel?.trim() || requestedModel,
    usage: value.usage,
  };
}

function isInferenceExecution(value: unknown): value is InferenceExecution {
  return isRecord(value) && value.kind === 'inferenceExecution' && 'output' in value;
}

interface RequiredModelExecution {
  readonly output: unknown;
  readonly usedModel: string;
  readonly usage?: InferenceUsage;
}

function createRun(
  request: InterpretationRequest,
  execution: InterpretationExecution,
  config: InferenceConfig,
  startedAt: Date,
  started: number,
  result: InferenceResult,
): InferenceRun {
  return {
    interpretationId: execution.interpretationId,
    operation: request.operation,
    reasoning: request.reasoning,
    target: config.target,
    provider: config.provider,
    requestedModel: config.model,
    usedModel: config.model,
    instructionsVersion: request.instructionsVersion,
    attempt: execution.attempt,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    result,
    createdAt: startedAt.toISOString(),
  };
}

function categorizeError(error: unknown): string {
  if (error instanceof InferenceAdapterError) {
    return error.category;
  }

  return error instanceof Error ? 'unexpected' : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDraft(value: unknown): value is RegisterInterpretationInput {
  if (!isRecord(value)) {
    return false;
  }

  const requiredCollections = [value.concepts, value.predicates, value.axioms];
  const hasRequiredShape =
    typeof value.entryId === 'string' && requiredCollections.every(Array.isArray);
  const hasValidOptionalLinks = value.links === undefined || Array.isArray(value.links);

  return hasRequiredShape && hasValidOptionalLinks;
}
