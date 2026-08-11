import type { InferenceRun, InferenceTelemetry } from '../../modules/interpretation/ports.js';
import type { QueryableDatabase } from './database.js';

/**
 * Persists inference metadata without storing prompts or complete responses.
 */
export class PostgresInferenceTelemetry implements InferenceTelemetry {
  constructor(private readonly database: QueryableDatabase) {}

  async record(run: InferenceRun): Promise<void> {
    await this.database.query(
      `INSERT INTO telemetry.runs (
        interpretation_id,
        operation,
        reasoning,
        target,
        provider,
        requested_model,
        used_model,
        attempt,
        duration_ms,
        result,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        error_category,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )`,
      [
        run.interpretationId,
        run.operation,
        run.reasoning,
        run.target,
        run.provider,
        run.requestedModel,
        run.usedModel,
        run.attempt,
        run.durationMs,
        run.result,
        run.inputTokens ?? null,
        run.outputTokens ?? null,
        run.estimatedCostUsd ?? null,
        run.errorCategory ?? null,
        run.createdAt,
      ],
    );
  }
}
