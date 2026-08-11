import { ComponentRevision } from '../../core/item/component.js';
import { Item } from '../../core/item/item.js';
import { type SchemaRegistry, selectCurrentRevisions } from '../../core/item/registry.js';
import type { ComponentValue, Evidence, ValidTime } from '../../core/item/types.js';
import { Entry } from '../../core/knowledge/entry.js';
import { normalizeText } from '../../core/knowledge/guard.js';
import type { EntryStore } from '../../modules/capture/ports/store.js';
import type { InterpretationStore } from '../../modules/interpretation/ports.js';
import type {
  InterpretationContext,
  InterpretationContextSource,
} from '../../modules/interpretation/services/context.js';
import type { ItemRegistration, ItemStore } from '../../modules/knowledge/ports/store.js';
import { ConflictError } from '../../system/error.js';
import type { Page, PageRequest } from '../../system/page.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import { decodeCursor, encodeCursor } from './page.js';
import {
  dateTime,
  equalJson,
  freezeList,
  json,
  jsonValue,
  optionalDateTime,
  optionalString,
} from './rows.js';

type EntryRow = Record<string, unknown>;
type ItemRow = Record<string, unknown>;
type RevisionRow = Record<string, unknown>;

/** PostgreSQL persistence for immutable Entries, Items and Component revisions. */
export class PostgresKnowledgeStore
  implements EntryStore, ItemStore, InterpretationStore, InterpretationContextSource
{
  constructor(
    private readonly database: QueryableDatabase,
    private readonly registry: SchemaRegistry,
  ) {}

  async saveEntry(entry: Entry): Promise<Entry> {
    await this.database.query(
      `INSERT INTO core_entries
        (id, content_kind, content_value, source, external_id, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        entry.id,
        entry.content.kind,
        entry.content.kind === 'text' ? entry.content.text : entry.content.url,
        entry.origin.source,
        entry.origin.externalId ?? null,
        entry.capturedAt,
      ],
    );
    const result = await this.database.query<EntryRow>(
      entry.origin.externalId
        ? `SELECT * FROM core_entries WHERE source = $1 AND external_id = $2`
        : `SELECT * FROM core_entries WHERE id = $1`,
      entry.origin.externalId ? [entry.origin.source, entry.origin.externalId] : [entry.id],
    );
    const stored = result.rows[0] ? decodeEntry(result.rows[0]) : undefined;
    if (!stored || !sameEntry(stored, entry)) {
      throw new ConflictError('Entry identity was reused with different content');
    }
    return stored;
  }

  async findEntry(id: string): Promise<Entry | undefined> {
    const result = await this.database.query<EntryRow>('SELECT * FROM core_entries WHERE id = $1', [
      id,
    ]);
    return result.rows[0] ? decodeEntry(result.rows[0]) : undefined;
  }

  async listEntries(request: PageRequest): Promise<Page<Entry>> {
    const cursor = decodeCursor(request.cursor, request.scope);
    const result = await this.database.query<EntryRow>(
      `SELECT * FROM core_entries
       WHERE ($1::timestamptz IS NULL OR (captured_at, id) < ($1::timestamptz, $2::text))
       ORDER BY captured_at DESC, id DESC
       LIMIT $3`,
      [cursor?.timestamp ?? null, cursor?.id ?? null, request.limit + 1],
    );
    const entries = result.rows.map(decodeEntry);
    const hasNext = entries.length > request.limit;
    const items = entries.slice(0, request.limit);
    const last = hasNext ? items.at(-1) : undefined;
    return Object.freeze({
      items: freezeList(items),
      nextCursor: encodeCursor(
        last ? { id: last.id, timestamp: last.capturedAt } : undefined,
        request.scope,
      ),
    });
  }

  async loadKnowledge() {
    const entries = await this.database.query<EntryRow>(
      'SELECT * FROM core_entries ORDER BY captured_at, id',
    );
    const items = await this.database.query<ItemRow>(
      'SELECT * FROM core_items ORDER BY created_at, id',
    );
    const revisions = await this.database.query<RevisionRow>(
      'SELECT * FROM core_component_revisions ORDER BY recorded_at, id',
    );
    const snapshot = Object.freeze({
      entries: freezeList(entries.rows.map(decodeEntry)),
      items: freezeList(items.rows.map(decodeItem)),
      revisions: freezeList(revisions.rows.map((row) => decodeRevision(row, this.registry))),
    });
    selectCurrentRevisions(snapshot.revisions);
    for (const item of snapshot.items) this.registry.validateComposition(item, snapshot.revisions);
    return snapshot;
  }

  async saveItems(registration: ItemRegistration): Promise<void> {
    for (const revision of registration.revisions) this.registry.validateRevision(revision);
    await inTransaction(this.database, async (database) => {
      for (const item of registration.items) {
        await database.query(
          `INSERT INTO core_items (id, created_at, profile_key, profile_version)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [item.id, item.createdAt, item.profile?.key ?? null, item.profile?.version ?? null],
        );
      }
      for (const revision of registration.revisions) {
        await database.query(
          `INSERT INTO core_component_revisions
            (id, item_id, key, schema_version, value, evidence, recorded_at, valid_from,
             valid_to, status, supersedes_revision_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            revision.id,
            revision.itemId,
            revision.key,
            revision.schemaVersion,
            jsonValue(revision.value),
            jsonValue(revision.evidence),
            revision.recordedAt,
            revision.validTime?.from ?? null,
            revision.validTime?.to ?? null,
            revision.status,
            revision.supersedesRevisionId ?? null,
          ],
        );
      }
      const snapshot = await new PostgresKnowledgeStore(database, this.registry).loadKnowledge();
      for (const item of registration.items) {
        const stored = snapshot.items.find(({ id }) => id === item.id);
        if (!stored || !equalJson(stored, item))
          throw new ConflictError(`Item id ${item.id} already exists`);
        this.registry.validateComposition(stored, snapshot.revisions);
      }
      for (const revision of registration.revisions) {
        const stored = snapshot.revisions.find(({ id }) => id === revision.id);
        if (!stored || !equalJson(stored, revision))
          throw new ConflictError(`Component revision id ${revision.id} already exists`);
      }
    });
  }

  async findItems(name: string): Promise<readonly Item[]> {
    const normalized = normalizeText(name);
    const snapshot = await this.loadKnowledge();
    const current = selectCurrentRevisions(snapshot.revisions);
    return freezeList(
      snapshot.items.filter((item) =>
        current.some(
          (revision) =>
            revision.itemId === item.id &&
            ['name', 'aliases'].includes(revision.key) &&
            values(revision.value).some((value) => normalizeText(value) === normalized),
        ),
      ),
    );
  }

  async findInterpretationContext(entry: Entry): Promise<InterpretationContext> {
    const content = normalizeSearchText(
      entry.content.kind === 'text' ? entry.content.text : entry.content.url,
    );
    const snapshot = await this.loadKnowledge();
    const current = selectCurrentRevisions(snapshot.revisions);
    const related = new Set(
      current
        .filter(
          (revision) =>
            ['name', 'aliases'].includes(revision.key) &&
            values(revision.value).some((value) => content.includes(normalizeSearchText(value))),
        )
        .map(({ itemId }) => itemId),
    );
    return Object.freeze({
      items: freezeList(snapshot.items.filter(({ id }) => related.has(id))),
      revisions: freezeList(current.filter(({ itemId }) => related.has(itemId))),
      componentSchemas: freezeList(
        this.registry
          .listComponents()
          .map(({ key, version, description }) => Object.freeze({ key, version, description })),
      ),
      profiles: freezeList(
        this.registry.listProfiles().map((profile) => json<typeof profile>(profile, 'Profile')),
      ),
    });
  }
}

function decodeEntry(row: EntryRow): Entry {
  const kind = row.content_kind === 'url' ? 'url' : 'text';
  const value = String(row.content_value);
  return Entry.rehydrate({
    id: String(row.id),
    content: kind === 'text' ? { kind, text: value } : { kind, url: value },
    origin: {
      source: String(row.source),
      externalId: optionalString(row.external_id, 'Entry externalId'),
    },
    capturedAt: dateTime(row.captured_at, 'Entry capturedAt'),
  });
}

function decodeItem(row: ItemRow): Item {
  const key = optionalString(row.profile_key, 'Item Profile key');
  return Item.rehydrate({
    id: String(row.id),
    createdAt: dateTime(row.created_at, 'Item createdAt'),
    profile: key ? { key, version: Number(row.profile_version) } : undefined,
  });
}

function decodeRevision(row: RevisionRow, registry: SchemaRegistry): ComponentRevision {
  const validFrom = optionalDateTime(row.valid_from, 'Component valid from');
  const validTo = optionalDateTime(row.valid_to, 'Component valid to');
  const revision = ComponentRevision.rehydrate({
    id: String(row.id),
    itemId: String(row.item_id),
    key: String(row.key),
    schemaVersion: Number(row.schema_version),
    value: json<ComponentValue>(row.value, 'Component value'),
    evidence: json<readonly Evidence[]>(row.evidence, 'Component evidence'),
    recordedAt: dateTime(row.recorded_at, 'Component recordedAt'),
    validTime: validFrom || validTo ? ({ from: validFrom, to: validTo } as ValidTime) : undefined,
    status: row.status as 'accepted' | 'candidate' | 'rejected',
    supersedesRevisionId: optionalString(row.supersedes_revision_id, 'Superseded revision id'),
  });
  registry.validateRevision(revision);
  return revision;
}

function sameEntry(left: Entry, right: Entry): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function values(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}
