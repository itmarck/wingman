import type { Entry } from '../../../core/knowledge/entry.js';
import type { InferenceRetryClass } from '../config.js';
import type { RegisterInterpretationInput } from '../domain/input.js';
import type { InterpreterIdentity } from '../domain/interpretation.js';
import type { InferenceResult, InferenceRun, InferenceTelemetry } from '../ports.js';
import type { InterpretationContext } from './context.js';
import { parseInterpretationOutput } from './output.js';
import { createInterpretationRequest, type InterpretationRequest } from './request.js';

export type { InterpretationAdapterOutput } from './output.js';

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
export class RetryableInferenceError extends InferenceAdapterError {
  constructor(
    readonly retryClass: InferenceRetryClass,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(retryClass === 'transient' ? 'unavailable' : retryClass, message);
    this.name = 'RetryableInferenceError';
  }
}

/**
 * Represents a completed adapter call whose output cannot be accepted as an Interpretation.
 */
export class InvalidInterpretationError extends RetryableInferenceError {
  constructor(message: string) {
    super('invalidResponse', message);
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
      const result = parseInterpretationOutput(inference.output, request.entry.id);

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
