import type { ReasoningLevel } from '../services/request.js';

export type InferenceResult = 'empty' | 'error' | 'invalid' | 'knowledge';

export interface InferenceRun {
  readonly interpretationId: string;
  readonly operation: string;
  readonly reasoning: ReasoningLevel;
  readonly target: string;
  readonly provider: string;
  readonly requestedModel: string;
  readonly usedModel: string;
  readonly attempt: number;
  readonly durationMs: number;
  readonly result: InferenceResult;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly errorCategory?: string;
  readonly createdAt: string;
}

/**
 * Best-effort technical telemetry for model executions.
 */
export interface InferenceTelemetry {
  record(run: InferenceRun): Promise<void>;
}
