import { describe, expect, it } from 'vitest';
import type { InferenceRun } from '../../../modules/interpretation/ports.js';
import type { Database, DatabaseResult } from '../database.js';
import { PostgresInferenceTelemetry } from '../telemetry.js';

describe('PostgreSQL inference telemetry', () => {
  it('depends on the database surface instead of the PostgreSQL driver', async () => {
    const database = new RecordingDatabase();
    const telemetry = new PostgresInferenceTelemetry(database);

    await telemetry.record(run);

    expect(database.statement).toContain('INSERT INTO telemetry.runs');
    expect(database.statement).not.toContain('policy_version');
    expect(database.parameters).toContain('interpretation-id');
    expect(database.parameters).toContain('openai.luna');
    expect(database.parameters).not.toContain('prompt');
  });
});

class RecordingDatabase implements Database {
  statement?: string;
  parameters?: readonly unknown[];

  async query<Row>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult<Row>> {
    this.statement = statement;
    this.parameters = parameters;

    return {
      rows: [],
    };
  }

  async close(): Promise<void> {}
}

const run: InferenceRun = {
  interpretationId: 'interpretation-id',
  operation: 'interpret-entry',
  reasoning: 'low',
  target: 'openai.luna',
  provider: 'provider',
  requestedModel: 'requested-model',
  usedModel: 'used-model',
  attempt: 1,
  durationMs: 10,
  result: 'knowledge',
  inputTokens: 100,
  outputTokens: 20,
  estimatedCostUsd: 0.01,
  createdAt: '2026-07-28T12:00:00.000Z',
};
