import type { Intent } from '../../core/execution/intent.js';
import type { Evidence } from '../../core/item/types.js';
import type { Suggestion } from '../../modules/suggestion/domain/suggestion.js';
import type { SuggestionLifecycle, SuggestionStore } from '../../modules/suggestion/ports/store.js';
import { ConflictError } from '../../system/error.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import { asConflict } from './errors.js';
import { PostgresExecutionStore } from './execution.js';
import { dateTime, equalJson, freezeList, json, jsonValue, optionalString } from './rows.js';

type Row = Record<string, unknown>;

/** PostgreSQL Suggestion facts with guarded feedback transitions. */
export class PostgresSuggestionStore implements SuggestionStore {
  constructor(private readonly database: QueryableDatabase) {}
  async save(suggestion: Suggestion): Promise<void> {
    await inTransaction(this.database, (database) => saveSuggestion(database, suggestion));
  }
  async find(id: string): Promise<Suggestion | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM assistance_suggestions WHERE id=$1', [id])
    ).rows[0];
    return row ? decodeSuggestion(row) : undefined;
  }
  async findFingerprint(fingerprint: string): Promise<Suggestion | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM assistance_suggestions WHERE fingerprint=$1', [
        fingerprint,
      ])
    ).rows[0];
    return row ? decodeSuggestion(row) : undefined;
  }
  async list(): Promise<readonly Suggestion[]> {
    const rows = (
      await this.database.query<Row>('SELECT * FROM assistance_suggestions ORDER BY created_at,id')
    ).rows;
    return freezeList(rows.map(decodeSuggestion));
  }
}

/** Atomic Suggestion plus optional Intent transitions. */
export class PostgresSuggestionLifecycle implements SuggestionLifecycle {
  constructor(private readonly database: QueryableDatabase) {}
  async create(suggestion: Suggestion, intent?: Intent): Promise<void> {
    await this.persist(suggestion, intent);
  }
  async accept(suggestion: Suggestion, consentedIntent?: Intent): Promise<void> {
    await this.persist(suggestion, consentedIntent);
  }
  private async persist(suggestion: Suggestion, intent?: Intent): Promise<void> {
    await inTransaction(this.database, async (database) => {
      if (intent) await new PostgresExecutionStore(database).saveIntent(intent);
      await saveSuggestion(database, suggestion);
    });
  }
}

async function saveSuggestion(database: QueryableDatabase, suggestion: Suggestion): Promise<void> {
  const current = (
    await database.query<Row>('SELECT * FROM assistance_suggestions WHERE id=$1 FOR UPDATE', [
      suggestion.id,
    ])
  ).rows[0];
  if (!current) {
    const fingerprint = (
      await database.query<{ id: string }>(
        'SELECT id FROM assistance_suggestions WHERE fingerprint=$1',
        [suggestion.fingerprint],
      )
    ).rows[0];
    if (fingerprint)
      throw new ConflictError(`Suggestion fingerprint ${suggestion.fingerprint} already exists`);
    try {
      await database.query(
        `INSERT INTO assistance_suggestions
      (id,fingerprint,detector_key,detector_version,subject_item_id,relevant_state,evidence,
       rationale,expected_effect,urgency,expires_at,capability_key,capability_version,autonomy,
       intent_id,status,created_at,feedback)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          suggestion.id,
          suggestion.fingerprint,
          suggestion.detector.key,
          suggestion.detector.version,
          suggestion.subjectItemId ?? null,
          suggestion.relevantState,
          jsonValue(suggestion.evidence),
          suggestion.rationale,
          suggestion.expectedEffect,
          suggestion.urgency,
          suggestion.expiresAt,
          suggestion.capability.key,
          suggestion.capability.version,
          jsonValue(suggestion.autonomy),
          suggestion.intentId ?? null,
          suggestion.status,
          suggestion.createdAt,
          jsonValue(suggestion.feedback),
        ],
      );
    } catch (error) {
      asConflict(error, `Suggestion ${suggestion.id} already exists`);
    }
    return;
  }
  const existing = decodeSuggestion(current);
  if (!sameIdentity(existing, suggestion))
    throw new ConflictError(`Suggestion ${suggestion.id} identity changed`);
  if (
    existing.status === suggestion.status &&
    JSON.stringify(existing.feedback) === JSON.stringify(suggestion.feedback)
  )
    return;
  if (!validTransition(existing.status, suggestion.status))
    throw new ConflictError(`Suggestion ${suggestion.id} transition is invalid`);
  const result = await database.query<{ id: string }>(
    `UPDATE assistance_suggestions SET status=$1,feedback=$2
    WHERE id=$3 AND status=$4 RETURNING id`,
    [suggestion.status, jsonValue(suggestion.feedback), suggestion.id, existing.status],
  );
  if (result.rows.length !== 1)
    throw new ConflictError(`Suggestion ${suggestion.id} changed concurrently`);
}

function decodeSuggestion(row: Row): Suggestion {
  return Object.freeze({
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    detector: Object.freeze({
      key: String(row.detector_key),
      version: Number(row.detector_version),
    }),
    subjectItemId: optionalString(row.subject_item_id, 'Suggestion subject Item'),
    relevantState: freezeList(json<string[]>(row.relevant_state, 'Suggestion State')),
    evidence: json<readonly Evidence[]>(row.evidence, 'Suggestion evidence'),
    rationale: String(row.rationale),
    expectedEffect: String(row.expected_effect),
    urgency: row.urgency as Suggestion['urgency'],
    expiresAt: dateTime(row.expires_at, 'Suggestion expiresAt'),
    capability: Object.freeze({
      key: String(row.capability_key),
      version: Number(row.capability_version),
    }),
    autonomy: json<Suggestion['autonomy']>(row.autonomy, 'Suggestion autonomy'),
    intentId: optionalString(row.intent_id, 'Suggestion Intent'),
    status: row.status as Suggestion['status'],
    createdAt: dateTime(row.created_at, 'Suggestion createdAt'),
    feedback: json<Suggestion['feedback']>(row.feedback, 'Suggestion feedback'),
  });
}

function sameIdentity(left: Suggestion, right: Suggestion): boolean {
  return equalJson(
    { ...left, status: undefined, feedback: undefined },
    { ...right, status: undefined, feedback: undefined },
  );
}
function validTransition(from: Suggestion['status'], to: Suggestion['status']): boolean {
  return (
    from === to ||
    (['active', 'postponed', 'modified'].includes(from) &&
      ['accepted', 'rejected', 'modified', 'postponed', 'expired', 'completed'].includes(to))
  );
}
