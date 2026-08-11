import { Attempt } from '../../core/execution/attempt.js';
import { Event } from '../../core/execution/event.js';
import { Intent, type IntentStatus } from '../../core/execution/intent.js';
import type { ComponentValue, Evidence } from '../../core/item/types.js';
import type { Condition } from '../../core/state/condition.js';
import type { ExecutionStore } from '../../modules/execution/ports/store.js';
import { ConflictError } from '../../system/error.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import { asConflict } from './errors.js';
import {
  dateTime,
  equalJson,
  freezeList,
  json,
  jsonValue,
  optionalDateTime,
  optionalJson,
  optionalString,
} from './rows.js';

type Row = Record<string, unknown>;

/** PostgreSQL Intent, Attempt and Event persistence with guarded lifecycle transitions. */
export class PostgresExecutionStore implements ExecutionStore {
  constructor(private readonly database: QueryableDatabase) {}

  async saveIntent(intent: Intent): Promise<void> {
    const existing = await this.findIntent(intent.id);
    if (!existing) {
      try {
        await this.database.query(
          `INSERT INTO execution_intents
            (id, capability_key, capability_version, input, proposer, conditions,
             expected_state, consent, trigger, evidence, created_at, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            intent.id,
            intent.capability.key,
            intent.capability.version,
            jsonValue(intent.input),
            jsonValue(intent.proposer),
            jsonValue(intent.conditions),
            jsonValue(intent.expectedState),
            intent.consent,
            intent.trigger ? jsonValue(intent.trigger) : null,
            jsonValue(intent.evidence),
            intent.createdAt,
            intent.status,
          ],
        );
        return;
      } catch (error) {
        asConflict(error, `Intent ${intent.id} already exists`);
      }
    }
    if (!sameIntentIdentity(existing, intent) || !validTransition(existing.status, intent.status))
      throw new ConflictError(`Intent ${intent.id} transition is invalid`);
    if (existing.status === intent.status) return;
    const result = await this.database.query<{ id: string }>(
      `UPDATE execution_intents SET status = $1 WHERE id = $2 AND status = $3 RETURNING id`,
      [intent.status, intent.id, existing.status],
    );
    if (result.rows.length !== 1)
      throw new ConflictError(`Intent ${intent.id} changed concurrently`);
  }

  async findIntent(id: string): Promise<Intent | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM execution_intents WHERE id = $1', [id])
    ).rows[0];
    return row ? decodeIntent(row) : undefined;
  }

  async listIntents(): Promise<readonly Intent[]> {
    const result = await this.database.query<Row>(
      'SELECT * FROM execution_intents ORDER BY created_at, id',
    );
    return freezeList(result.rows.map(decodeIntent));
  }

  async reserveAttempt(attempt: Attempt): Promise<void> {
    if (attempt.outcome !== 'started') throw new ConflictError('Reserved Attempt must be started');
    try {
      await inTransaction(this.database, async (database) => {
        const intent = await database.query<{ status: IntentStatus; consent: string }>(
          'SELECT status, consent FROM execution_intents WHERE id = $1 FOR UPDATE',
          [attempt.intentId],
        );
        const state = intent.rows[0];
        const eligible =
          state &&
          ((state.status === 'proposed' && state.consent === 'none') ||
            state.status === 'consented');
        if (!eligible) throw new ConflictError(`Intent ${attempt.intentId} is not executable`);
        await database.query(
          `INSERT INTO execution_attempts
            (id, intent_id, sequence, idempotency_key, started_at, outcome)
           VALUES ($1,$2,$3,$4,$5,'started')`,
          [
            attempt.id,
            attempt.intentId,
            attempt.sequence,
            attempt.idempotencyKey,
            attempt.startedAt,
          ],
        );
      });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      asConflict(error, `Intent ${attempt.intentId} already has an Attempt`);
    }
  }

  async finishAttempt(
    attempt: Attempt,
    events: readonly Event[],
    completedIntent?: Intent,
  ): Promise<void> {
    if (attempt.outcome === 'started')
      throw new ConflictError('Finished Attempt cannot be started');
    await inTransaction(this.database, async (database) => {
      const updated = await database.query<{ id: string }>(
        `UPDATE execution_attempts
         SET finished_at=$1, outcome=$2, output=$3, message=$4
         WHERE id=$5 AND intent_id=$6 AND outcome='started' RETURNING id`,
        [
          attempt.finishedAt,
          attempt.outcome,
          attempt.output === undefined ? null : jsonValue(attempt.output),
          attempt.message ?? null,
          attempt.id,
          attempt.intentId,
        ],
      );
      if (updated.rows.length !== 1) throw new ConflictError(`Attempt ${attempt.id} is not active`);
      for (const event of events) await insertEvent(database, event);
      if (completedIntent) {
        const changed = await database.query<{ id: string }>(
          `UPDATE execution_intents SET status='completed'
           WHERE id=$1 AND status=$2 RETURNING id`,
          [completedIntent.id, completedIntent.consent === 'none' ? 'proposed' : 'consented'],
        );
        if (changed.rows.length !== 1)
          throw new ConflictError(`Intent ${completedIntent.id} changed concurrently`);
      }
    });
  }

  async listAttempts(intentId: string): Promise<readonly Attempt[]> {
    const result = await this.database.query<Row>(
      'SELECT * FROM execution_attempts WHERE intent_id=$1 ORDER BY sequence',
      [intentId],
    );
    return freezeList(result.rows.map(decodeAttempt));
  }

  async appendEvent(event: Event): Promise<void> {
    try {
      await insertEvent(this.database, event);
    } catch (error) {
      asConflict(error, `Event ${event.id} already exists`);
    }
  }

  async listEvents(intentId?: string): Promise<readonly Event[]> {
    const result = await this.database.query<Row>(
      `SELECT * FROM execution_events WHERE ($1::text IS NULL OR intent_id=$1)
       ORDER BY occurred_at, id`,
      [intentId ?? null],
    );
    return freezeList(result.rows.map(decodeEvent));
  }
}

async function insertEvent(database: QueryableDatabase, event: Event): Promise<void> {
  await database.query(
    `INSERT INTO execution_events (id,key,occurred_at,intent_id,attempt_id,entry_id,data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      event.id,
      event.key,
      event.occurredAt,
      event.causation.intentId ?? null,
      event.causation.attemptId ?? null,
      event.causation.entryId ?? null,
      jsonValue(event.data),
    ],
  );
}

function decodeIntent(row: Row): Intent {
  return Intent.create({
    id: String(row.id),
    capability: { key: String(row.capability_key), version: Number(row.capability_version) },
    input: json<ComponentValue>(row.input, 'Intent input'),
    proposer: json(row.proposer, 'Intent proposer'),
    conditions: json<readonly Condition[]>(row.conditions, 'Intent conditions'),
    expectedState: json<readonly Condition[]>(row.expected_state, 'Intent expected State'),
    consent: row.consent as 'none' | 'explicit',
    trigger: optionalJson(row.trigger),
    evidence: json<readonly Evidence[]>(row.evidence, 'Intent evidence'),
    createdAt: dateTime(row.created_at, 'Intent createdAt'),
    status: row.status as IntentStatus,
  });
}

function decodeAttempt(row: Row): Attempt {
  return Attempt.create({
    id: String(row.id),
    intentId: String(row.intent_id),
    sequence: Number(row.sequence),
    idempotencyKey: String(row.idempotency_key),
    startedAt: dateTime(row.started_at, 'Attempt startedAt'),
    finishedAt: optionalDateTime(row.finished_at, 'Attempt finishedAt'),
    outcome: row.outcome as Attempt['outcome'],
    output: optionalJson(row.output),
    message: optionalString(row.message, 'Attempt message'),
  });
}

function decodeEvent(row: Row): Event {
  return Event.create({
    id: String(row.id),
    key: String(row.key),
    occurredAt: dateTime(row.occurred_at, 'Event occurredAt'),
    causation: {
      intentId: optionalString(row.intent_id, 'Event Intent id'),
      attemptId: optionalString(row.attempt_id, 'Event Attempt id'),
      entryId: optionalString(row.entry_id, 'Event Entry id'),
    },
    data: json<ComponentValue>(row.data, 'Event data'),
  });
}

function sameIntentIdentity(left: Intent, right: Intent): boolean {
  return equalJson({ ...left, status: undefined }, { ...right, status: undefined });
}

function validTransition(from: IntentStatus, to: IntentStatus): boolean {
  return (
    from === to ||
    (from === 'proposed' && ['consented', 'cancelled', 'completed'].includes(to)) ||
    (from === 'consented' && ['cancelled', 'completed'].includes(to))
  );
}
