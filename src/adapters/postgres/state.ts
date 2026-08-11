import type { Evidence, ValidTime } from '../../core/item/types.js';
import type { Condition } from '../../core/state/condition.js';
import { type Modality, State } from '../../core/state/state.js';
import type { StateStore } from '../../modules/state/ports/store.js';
import { ConflictError } from '../../system/error.js';
import type { QueryableDatabase } from './database.js';
import { dateTime, freezeList, json, jsonValue, optionalDateTime, optionalString } from './rows.js';

type StateRow = Record<string, unknown>;

/** Insert-only PostgreSQL State persistence. */
export class PostgresStateStore implements StateStore {
  constructor(private readonly database: QueryableDatabase) {}

  async saveState(state: State): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `INSERT INTO core_states
        (id, modality, condition, author_kind, author_id, evidence, recorded_at,
         valid_from, valid_to, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [
        state.id,
        state.modality,
        jsonValue(state.condition),
        state.author.kind,
        state.author.id ?? null,
        jsonValue(state.evidence),
        state.recordedAt,
        state.validTime?.from ?? null,
        state.validTime?.to ?? null,
        state.confidence ?? null,
      ],
    );
    if (result.rows.length === 0) {
      const existing = (
        await this.database.query<StateRow>('SELECT * FROM core_states WHERE id = $1', [state.id])
      ).rows[0];
      if (!existing || JSON.stringify(decodeState(existing)) !== JSON.stringify(state))
        throw new ConflictError(`State id ${state.id} already exists`);
    }
  }

  async listStates(modality?: Modality): Promise<readonly State[]> {
    const result = await this.database.query<StateRow>(
      `SELECT * FROM core_states WHERE ($1::text IS NULL OR modality = $1)
       ORDER BY recorded_at, id`,
      [modality ?? null],
    );
    return freezeList(result.rows.map(decodeState));
  }
}

function decodeState(row: StateRow): State {
  const from = optionalDateTime(row.valid_from, 'State valid from');
  const to = optionalDateTime(row.valid_to, 'State valid to');
  return State.rehydrate({
    id: String(row.id),
    modality: row.modality as Modality,
    condition: json<Condition>(row.condition, 'State condition'),
    author: {
      kind: row.author_kind as 'user' | 'system' | 'inference',
      id: optionalString(row.author_id, 'State author id'),
    },
    evidence: json<readonly Evidence[]>(row.evidence, 'State evidence'),
    recordedAt: dateTime(row.recorded_at, 'State recordedAt'),
    validTime: from || to ? ({ from, to } as ValidTime) : undefined,
    confidence:
      row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
  });
}
