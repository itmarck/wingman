import { Automation } from '../../core/automation/automation.js';
import type { Event } from '../../core/execution/event.js';
import type { Evidence, ItemReference } from '../../core/item/types.js';
import type { Condition } from '../../core/state/condition.js';
import type {
  AutomationEvaluationResult,
  AutomationOccurrence,
  AutomationRuntime,
  AutomationStore,
  StateChangeSignal,
} from '../../modules/automation/ports/store.js';
import { ConflictError } from '../../system/error.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import { PostgresExecutionStore } from './execution.js';
import { dateTime, equalJson, freezeList, json, jsonValue, optionalDateTime } from './rows.js';

type Row = Record<string, unknown>;

/** PostgreSQL Automation selectors and atomic occurrence publication. */
export class PostgresAutomationStore implements AutomationStore {
  constructor(private readonly database: QueryableDatabase) {}

  async save(runtime: AutomationRuntime): Promise<void> {
    await inTransaction(this.database, (database) => saveRuntime(database, runtime));
  }
  async find(id: string): Promise<AutomationRuntime | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM automation_definitions WHERE id=$1', [id])
    ).rows[0];
    return row ? decodeRuntime(this.database, row) : undefined;
  }
  async list(): Promise<readonly AutomationRuntime[]> {
    const rows = (
      await this.database.query<Row>('SELECT * FROM automation_definitions ORDER BY created_at,id')
    ).rows;
    return freezeList(await Promise.all(rows.map((row) => decodeRuntime(this.database, row))));
  }
  async due(at: string): Promise<readonly AutomationRuntime[]> {
    const rows = (
      await this.database.query<Row>(
        `SELECT * FROM automation_definitions
      WHERE status='active' AND next_evaluation_at <= $1
      ORDER BY COALESCE((controls->>'priority')::integer,0) DESC,id`,
        [at],
      )
    ).rows;
    return freezeList(await Promise.all(rows.map((row) => decodeRuntime(this.database, row))));
  }
  async forEvent(event: Event): Promise<readonly AutomationRuntime[]> {
    const rows = (
      await this.database.query<Row>(
        `SELECT * FROM automation_definitions
      WHERE status='active' AND trigger->'operator'->>'key'='event' AND trigger->>'eventKey'=$1
      ORDER BY COALESCE((controls->>'priority')::integer,0) DESC,id`,
        [event.key],
      )
    ).rows;
    return freezeList(await Promise.all(rows.map((row) => decodeRuntime(this.database, row))));
  }
  async forStateChange(signal: StateChangeSignal): Promise<readonly AutomationRuntime[]> {
    const rows = (
      await this.database.query<Row>(
        `SELECT * FROM automation_definitions
      WHERE status='active' AND trigger->'operator'->>'key'='stateChange'
        AND ((trigger->'itemIds') ?| $1::text[] OR (trigger->'componentKeys') ?| $2::text[])
      ORDER BY COALESCE((controls->>'priority')::integer,0) DESC,id`,
        [signal.itemIds, signal.componentKeys],
      )
    ).rows;
    return freezeList(await Promise.all(rows.map((row) => decodeRuntime(this.database, row))));
  }
  async appendResult(result: AutomationEvaluationResult): Promise<void> {
    await insertResult(this.database, result);
  }
  async commitOccurrence(occurrence: AutomationOccurrence): Promise<boolean> {
    return inTransaction(this.database, async (database) => {
      const reserved = await database.query<{ automation_id: string }>(
        `INSERT INTO automation_deduplications
        (automation_id,deduplication_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING automation_id`,
        [occurrence.runtime.automation.id, occurrence.deduplicationId],
      );
      if (reserved.rows.length === 0) return false;
      const executions = new PostgresExecutionStore(database);
      for (const intent of occurrence.intents) await executions.saveIntent(intent);
      await saveRuntime(database, occurrence.runtime);
      await insertResult(database, occurrence.result);
      return true;
    });
  }
  async listResults(automationId: string): Promise<readonly AutomationEvaluationResult[]> {
    const rows = (
      await this.database.query<Row>(
        'SELECT * FROM automation_evaluations WHERE automation_id=$1 ORDER BY evaluated_at,id',
        [automationId],
      )
    ).rows;
    return freezeList(rows.map(decodeResult));
  }
}

async function saveRuntime(database: QueryableDatabase, runtime: AutomationRuntime): Promise<void> {
  const current = (
    await database.query<Row>('SELECT * FROM automation_definitions WHERE id=$1 FOR UPDATE', [
      runtime.automation.id,
    ])
  ).rows[0];
  if (!current) {
    await database.query(
      `INSERT INTO automation_definitions
      (id,subjects,given_conditions,trigger,then_intents,controls,evidence,created_at,status,
       next_evaluation_at,last_produced_at,occurrences)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      runtimeParameters(runtime),
    );
  } else {
    const existing = await decodeRuntime(database, current);
    if (!sameDefinition(existing.automation, runtime.automation))
      throw new ConflictError(`Automation ${runtime.automation.id} definition changed`);
    const result = await database.query<{ id: string }>(
      `UPDATE automation_definitions
      SET trigger=$1,controls=$2,status=$3,next_evaluation_at=$4,last_produced_at=$5,occurrences=$6
      WHERE id=$7 AND status=$8 AND occurrences=$9 RETURNING id`,
      [
        jsonValue(runtime.automation.when),
        jsonValue(runtime.automation.controls),
        runtime.automation.status,
        runtime.nextEvaluationAt ?? null,
        runtime.lastProducedAt ?? null,
        runtime.occurrences,
        runtime.automation.id,
        existing.automation.status,
        existing.occurrences,
      ],
    );
    if (result.rows.length !== 1)
      throw new ConflictError(`Automation ${runtime.automation.id} changed concurrently`);
  }
  for (const id of runtime.deduplicationIds)
    await database.query(
      `INSERT INTO automation_deduplications
    (automation_id,deduplication_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [runtime.automation.id, id],
    );
}

async function decodeRuntime(database: QueryableDatabase, row: Row): Promise<AutomationRuntime> {
  const deduplications = await database.query<{ deduplication_id: string }>(
    'SELECT deduplication_id FROM automation_deduplications WHERE automation_id=$1',
    [String(row.id)],
  );
  const automation = Automation.create({
    id: String(row.id),
    subjects: json<readonly ItemReference[]>(row.subjects, 'Automation subjects'),
    given: json<readonly Condition[]>(row.given_conditions, 'Automation conditions'),
    when: json(row.trigger, 'Automation trigger'),
    thenIntents: json(row.then_intents, 'Automation Intents'),
    controls: json(row.controls, 'Automation controls'),
    evidence: json<readonly Evidence[]>(row.evidence, 'Automation evidence'),
    createdAt: dateTime(row.created_at, 'Automation createdAt'),
    status: row.status as Automation['status'],
  });
  return Object.freeze({
    automation,
    nextEvaluationAt: optionalDateTime(row.next_evaluation_at, 'Automation next evaluation'),
    lastProducedAt: optionalDateTime(row.last_produced_at, 'Automation last produced'),
    occurrences: Number(row.occurrences),
    deduplicationIds: new Set(deduplications.rows.map(({ deduplication_id }) => deduplication_id)),
  });
}

async function insertResult(
  database: QueryableDatabase,
  result: AutomationEvaluationResult,
): Promise<void> {
  await database.query(
    `INSERT INTO automation_evaluations
    (id,automation_id,trigger_id,evaluated_at,outcome,intent_ids,reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      result.id,
      result.automationId,
      result.triggerId,
      result.evaluatedAt,
      result.outcome,
      result.intentIds,
      result.reason,
    ],
  );
}

function decodeResult(row: Row): AutomationEvaluationResult {
  return Object.freeze({
    id: String(row.id),
    automationId: String(row.automation_id),
    triggerId: String(row.trigger_id),
    evaluatedAt: dateTime(row.evaluated_at, 'Automation evaluatedAt'),
    outcome: row.outcome as AutomationEvaluationResult['outcome'],
    intentIds: freezeList(json<string[]>(row.intent_ids, 'Automation result Intent ids')),
    reason: String(row.reason),
  });
}

function runtimeParameters(runtime: AutomationRuntime): readonly unknown[] {
  const value = runtime.automation;
  return [
    value.id,
    jsonValue(value.subjects),
    jsonValue(value.given),
    jsonValue(value.when),
    jsonValue(value.thenIntents),
    jsonValue(value.controls),
    jsonValue(value.evidence),
    value.createdAt,
    value.status,
    runtime.nextEvaluationAt ?? null,
    runtime.lastProducedAt ?? null,
    runtime.occurrences,
  ];
}

function sameDefinition(left: Automation, right: Automation): boolean {
  return equalJson(
    { ...left, status: undefined, when: undefined, controls: undefined },
    { ...right, status: undefined, when: undefined, controls: undefined },
  );
}
