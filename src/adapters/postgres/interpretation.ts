import type { ComponentValue } from '../../core/item/types.js';
import { Interpretation } from '../../modules/interpretation/domain/interpretation.js';
import type {
  ClaimInterpretationInput,
  DeclarationOutcome,
  InterpretationClaim,
  InterpretationQueue,
  InterpretationStateStore,
} from '../../modules/interpretation/ports.js';
import { InterpretationClaimError } from '../../modules/interpretation/ports.js';
import { ConflictError, InvalidInputError } from '../../system/error.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import {
  dateTime,
  freezeList,
  jsonValue,
  optionalDateTime,
  optionalJson,
  optionalString,
} from './rows.js';

type Row = Record<string, unknown>;

/** PostgreSQL Interpretation history, outcomes and recoverable queue claims. */
export class PostgresInterpretations implements InterpretationStateStore, InterpretationQueue {
  constructor(private readonly database: QueryableDatabase) {}

  async saveInterpretation(interpretation: Interpretation): Promise<void> {
    await inTransaction(this.database, (database) => saveInterpretation(database, interpretation));
  }

  async findInterpretation(id: string): Promise<Interpretation | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM interpretation_runs WHERE id=$1', [id])
    ).rows[0];
    return row ? decodeInterpretation(row) : undefined;
  }

  async findLatestInterpretation(entryId: string): Promise<Interpretation | undefined> {
    const row = (
      await this.database.query<Row>(
        'SELECT * FROM interpretation_runs WHERE entry_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
        [entryId],
      )
    ).rows[0];
    return row ? decodeInterpretation(row) : undefined;
  }

  async listInterpretations(entryId: string): Promise<readonly Interpretation[]> {
    const result = await this.database.query<Row>(
      'SELECT * FROM interpretation_runs WHERE entry_id=$1 ORDER BY created_at,id',
      [entryId],
    );
    return freezeList(result.rows.map(decodeInterpretation));
  }

  async listDeclarationOutcomes(entryId?: string): Promise<readonly DeclarationOutcome[]> {
    const result = await this.database.query<Row>(
      `SELECT * FROM interpretation_declaration_outcomes
       WHERE ($1::text IS NULL OR entry_id=$1) ORDER BY recorded_at,entry_id,reference`,
      [entryId ?? null],
    );
    return freezeList(result.rows.map(decodeOutcome));
  }

  async saveDeclarationOutcomes(outcomes: readonly DeclarationOutcome[]): Promise<void> {
    for (const outcome of outcomes) {
      const result = await this.database.query<{ entry_id: string }>(
        `INSERT INTO interpretation_declaration_outcomes
          (entry_id,reference,kind,status,target_id,reason,details,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (entry_id,reference) DO NOTHING RETURNING entry_id`,
        [
          outcome.entryId,
          outcome.reference,
          outcome.kind,
          outcome.status,
          outcome.targetId ?? null,
          outcome.reason ?? null,
          outcome.details === undefined ? null : jsonValue(outcome.details),
          outcome.recordedAt,
        ],
      );
      if (result.rows.length === 0) {
        const existing = (await this.listDeclarationOutcomes(outcome.entryId)).find(
          ({ reference }) => reference === outcome.reference,
        );
        if (JSON.stringify(existing) !== JSON.stringify(outcome))
          throw new ConflictError(`Declaration outcome ${outcome.reference} already exists`);
      }
    }
  }

  async enqueue(interpretationId: string): Promise<void> {
    const interpretation = await this.findInterpretation(interpretationId);
    if (interpretation?.status !== 'queued')
      throw new ConflictError(`Interpretation ${interpretationId} is not queued`);
  }

  async claim(input: ClaimInterpretationInput): Promise<InterpretationClaim | undefined> {
    assertClaimWindow(input);
    return inTransaction(this.database, async (database) => {
      const candidate = (
        await database.query<{ id: string; status: string }>(
          `SELECT r.id,r.status
         FROM interpretation_runs r
         LEFT JOIN interpretation_claims c ON c.interpretation_id=r.id
         WHERE ((r.status='queued' AND r.available_at <= $1) OR r.status='processing')
           AND (c.interpretation_id IS NULL OR c.lease_until <= $1)
         ORDER BY COALESCE(r.available_at,r.updated_at),r.created_at,r.id
         FOR UPDATE OF r SKIP LOCKED LIMIT 1`,
          [input.claimedAt],
        )
      ).rows[0];
      if (!candidate) return undefined;
      await database.query(
        `INSERT INTO interpretation_claims (interpretation_id,claim_id,claimed_at,lease_until)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (interpretation_id) DO UPDATE
         SET claim_id=EXCLUDED.claim_id,claimed_at=EXCLUDED.claimed_at,lease_until=EXCLUDED.lease_until`,
        [candidate.id, input.claimId, input.claimedAt, input.leaseUntil],
      );
      return Object.freeze({
        interpretationId: candidate.id,
        claimId: input.claimId,
        leaseUntil: input.leaseUntil,
        recovered: candidate.status === 'processing',
      });
    });
  }

  async start(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await inTransaction(this.database, async (database) => {
      await assertActiveClaim(database, claim);
      if (claim.interpretationId !== interpretation.id)
        throw new ConflictError('Interpretation claim and state have different identities');
      await saveInterpretation(database, interpretation);
    });
  }

  async renew(claim: InterpretationClaim, leaseUntil: string): Promise<void> {
    if (Date.parse(leaseUntil) <= Date.parse(claim.leaseUntil))
      throw new InvalidInputError('Interpretation lease renewal must extend the active lease');
    const result = await this.database.query<{ interpretation_id: string }>(
      `UPDATE interpretation_claims SET lease_until=$1
       WHERE interpretation_id=$2 AND claim_id=$3 AND lease_until < $1 RETURNING interpretation_id`,
      [leaseUntil, claim.interpretationId, claim.claimId],
    );
    if (result.rows.length !== 1) throw inactiveClaim(claim);
  }

  async complete(claim: InterpretationClaim): Promise<void> {
    await inTransaction(this.database, async (database) => {
      const status = (
        await database.query<{ status: string }>(
          'SELECT status FROM interpretation_runs WHERE id=$1 FOR UPDATE',
          [claim.interpretationId],
        )
      ).rows[0]?.status;
      if (!status || !['completed', 'pending'].includes(status))
        throw new ConflictError(
          `Interpretation ${claim.interpretationId} has not completed processing`,
        );
      await deleteClaim(database, claim);
    });
  }

  async retry(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await this.settle(claim, interpretation, ['queued']);
  }

  async fail(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await this.settle(claim, interpretation, ['failed', 'exhausted']);
  }

  async assertClaim(claim: InterpretationClaim): Promise<void> {
    await assertActiveClaim(this.database, claim);
  }

  private async settle(
    claim: InterpretationClaim,
    interpretation: Interpretation,
    statuses: readonly string[],
  ): Promise<void> {
    if (claim.interpretationId !== interpretation.id || !statuses.includes(interpretation.status))
      throw new ConflictError(
        `Interpretation ${interpretation.id} cannot settle as ${interpretation.status}`,
      );
    await inTransaction(this.database, async (database) => {
      await assertActiveClaim(database, claim);
      await saveInterpretation(database, interpretation);
      await deleteClaim(database, claim);
    });
  }
}

export async function saveInterpretation(
  database: QueryableDatabase,
  interpretation: Interpretation,
): Promise<void> {
  const current = (
    await database.query<Row>('SELECT * FROM interpretation_runs WHERE id=$1 FOR UPDATE', [
      interpretation.id,
    ])
  ).rows[0];
  if (!current) {
    await database.query(
      `INSERT INTO interpretation_runs
        (id,entry_id,status,attempts,created_at,updated_at,available_at,interpreter_key,draft,publication,error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      interpretationParameters(interpretation),
    );
    return;
  }
  const existing = decodeInterpretation(current);
  if (existing.entryId !== interpretation.entryId)
    throw new ConflictError(`Interpretation ${interpretation.id} changed its Entry`);
  const updated = await database.query<{ id: string }>(
    `UPDATE interpretation_runs SET status=$1,attempts=$2,updated_at=$3,available_at=$4,
       interpreter_key=$5,draft=$6,publication=$7,error=$8
     WHERE id=$9 AND status=$10 AND updated_at=$11 RETURNING id`,
    [
      interpretation.status,
      interpretation.attempts,
      interpretation.updatedAt,
      interpretation.availableAt ?? null,
      interpretation.interpreter?.key ?? null,
      interpretation.draft ? jsonValue(interpretation.draft) : null,
      interpretation.publication ? jsonValue(interpretation.publication) : null,
      interpretation.error ?? null,
      interpretation.id,
      existing.status,
      existing.updatedAt,
    ],
  );
  if (updated.rows.length !== 1)
    throw new ConflictError(`Interpretation ${interpretation.id} changed concurrently`);
}

export async function assertActiveClaim(
  database: QueryableDatabase,
  claim: InterpretationClaim,
): Promise<void> {
  const active = (
    await database.query<{ claim_id: string }>(
      'SELECT claim_id FROM interpretation_claims WHERE interpretation_id=$1',
      [claim.interpretationId],
    )
  ).rows[0];
  if (active?.claim_id !== claim.claimId) throw inactiveClaim(claim);
}

function interpretationParameters(value: Interpretation): readonly unknown[] {
  return [
    value.id,
    value.entryId,
    value.status,
    value.attempts,
    value.createdAt,
    value.updatedAt,
    value.availableAt ?? null,
    value.interpreter?.key ?? null,
    value.draft ? jsonValue(value.draft) : null,
    value.publication ? jsonValue(value.publication) : null,
    value.error ?? null,
  ];
}

function decodeInterpretation(row: Row): Interpretation {
  const key = optionalString(row.interpreter_key, 'Interpreter key');
  return Interpretation.rehydrate({
    id: String(row.id),
    entryId: String(row.entry_id),
    status: row.status as Interpretation['status'],
    attempts: Number(row.attempts),
    createdAt: dateTime(row.created_at, 'Interpretation createdAt'),
    updatedAt: dateTime(row.updated_at, 'Interpretation updatedAt'),
    availableAt: optionalDateTime(row.available_at, 'Interpretation availableAt'),
    interpreter: key ? { key } : undefined,
    draft: optionalJson(row.draft),
    publication: optionalJson(row.publication),
    error: optionalString(row.error, 'Interpretation error'),
  });
}

function decodeOutcome(row: Row): DeclarationOutcome {
  return Object.freeze({
    entryId: String(row.entry_id),
    reference: String(row.reference),
    kind: row.kind as DeclarationOutcome['kind'],
    status: row.status as DeclarationOutcome['status'],
    targetId: optionalString(row.target_id, 'Outcome target id'),
    reason: optionalString(row.reason, 'Outcome reason'),
    details: optionalJson<ComponentValue>(row.details),
    recordedAt: dateTime(row.recorded_at, 'Outcome recordedAt'),
  });
}

async function deleteClaim(database: QueryableDatabase, claim: InterpretationClaim): Promise<void> {
  const result = await database.query<{ interpretation_id: string }>(
    'DELETE FROM interpretation_claims WHERE interpretation_id=$1 AND claim_id=$2 RETURNING interpretation_id',
    [claim.interpretationId, claim.claimId],
  );
  if (result.rows.length !== 1) throw inactiveClaim(claim);
}

function inactiveClaim(claim: InterpretationClaim): InterpretationClaimError {
  return new InterpretationClaimError(
    `Interpretation ${claim.interpretationId} claim is no longer active`,
  );
}

function assertClaimWindow(input: ClaimInterpretationInput): void {
  if (!input.claimId.trim()) throw new InvalidInputError('Interpretation claimId cannot be empty');
  if (
    !Number.isFinite(Date.parse(input.claimedAt)) ||
    Date.parse(input.leaseUntil) <= Date.parse(input.claimedAt)
  )
    throw new InvalidInputError('Interpretation lease must end after the claim time');
}
