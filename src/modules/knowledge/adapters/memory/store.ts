import { createPage } from '../../../../adapters/memory/page.js';
import type { ComponentRevision, ComponentRevisionId } from '../../../../core/item/component.js';
import type { Item, ItemId } from '../../../../core/item/item.js';
import { type SchemaRegistry, selectCurrentRevisions } from '../../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../../core/item/snapshot.js';
import { createKnowledgeRegistry } from '../../../../core/item/system.js';
import type { Entry, EntryId } from '../../../../core/knowledge/entry.js';
import { normalizeText } from '../../../../core/knowledge/guard.js';
import { ConflictError, NotFoundError } from '../../../../system/error.js';
import type { Page, PageRequest } from '../../../../system/page.js';
import type { EntryStore } from '../../../capture/ports/store.js';
import type {
  InterpretationRegistration,
  InterpretationStore,
} from '../../../interpretation/ports/store.js';
import type {
  InterpretationContext,
  InterpretationContextSource,
} from '../../../interpretation/services/context.js';
import type { ProjectionSource } from '../../../projection/ports/source.js';
import type { ItemRegistration, ItemStore } from '../../ports/store.js';

/** Coherent in-memory persistence for Entries, Items and Component revisions. */
export class MemoryKnowledgeStore
  implements
    EntryStore,
    ItemStore,
    InterpretationStore,
    ProjectionSource,
    InterpretationContextSource
{
  #entries = new Map<EntryId, Entry>();
  #items = new Map<ItemId, Item>();
  #revisions = new Map<ComponentRevisionId, ComponentRevision>();

  constructor(private readonly registry: SchemaRegistry = createKnowledgeRegistry()) {}

  async saveEntry(entry: Entry): Promise<Entry> {
    const duplicate = findExternalEntry(this.#entries.values(), entry);
    if (duplicate) {
      assertSameContent(duplicate, entry);
      return duplicate;
    }
    addEntity(this.#entries, entry, 'Entry');
    return entry;
  }

  async findEntry(id: EntryId): Promise<Entry | undefined> {
    return this.#entries.get(id);
  }

  async listEntries(request: PageRequest): Promise<Page<Entry>> {
    return createPage(this.#entries.values(), request, (entry) => ({
      id: entry.id,
      timestamp: entry.capturedAt,
    }));
  }

  async loadKnowledge(): Promise<KnowledgeSnapshot> {
    return Object.freeze({
      entries: Object.freeze([...this.#entries.values()]),
      items: Object.freeze([...this.#items.values()]),
      revisions: Object.freeze([...this.#revisions.values()]),
    });
  }

  async saveItems(registration: ItemRegistration): Promise<void> {
    this.commit(this.prepare(registration));
  }
  async saveInterpretation(registration: InterpretationRegistration): Promise<void> {
    this.commit(this.prepare(registration));
  }

  async findItems(name: string): Promise<readonly Item[]> {
    const normalized = normalizeText(name);
    const current = selectCurrentRevisions([...this.#revisions.values()]);
    return Object.freeze(
      [...this.#items.values()].filter((item) =>
        current.some(
          (revision) =>
            revision.itemId === item.id &&
            ['name', 'aliases'].includes(revision.key) &&
            (typeof revision.value === 'string'
              ? normalizeText(revision.value) === normalized
              : Array.isArray(revision.value) &&
                revision.value.some(
                  (value) => typeof value === 'string' && normalizeText(value) === normalized,
                )),
        ),
      ),
    );
  }

  async findInterpretationContext(entry: Entry): Promise<InterpretationContext> {
    const content = normalizeSearchText(
      entry.content.kind === 'text' ? entry.content.text : entry.content.url,
    );
    const current = selectCurrentRevisions([...this.#revisions.values()]);
    const relatedIds = new Set(
      current
        .filter(
          (revision) =>
            ['name', 'aliases'].includes(revision.key) &&
            values(revision.value).some((value) => content.includes(normalizeSearchText(value))),
        )
        .map((revision) => revision.itemId),
    );
    return Object.freeze({
      items: Object.freeze([...this.#items.values()].filter((item) => relatedIds.has(item.id))),
      revisions: Object.freeze(current.filter((revision) => relatedIds.has(revision.itemId))),
      componentSchemas: Object.freeze(
        this.registry
          .listComponents()
          .map(({ key, version, description }) => Object.freeze({ key, version, description })),
      ),
      profiles: Object.freeze(
        this.registry.listProfiles().map((profile) => Object.freeze(structuredClone(profile))),
      ),
    });
  }

  private prepare(registration: ItemRegistration): {
    items: Map<ItemId, Item>;
    revisions: Map<ComponentRevisionId, ComponentRevision>;
  } {
    const items = new Map(this.#items);
    const revisions = new Map(this.#revisions);
    for (const item of registration.items) addEntity(items, item, 'Item');
    for (const revision of registration.revisions) {
      requireEntity(items, revision.itemId, 'Item');
      for (const evidence of revision.evidence)
        requireEntity(this.#entries, evidence.entryId, 'Entry');
      this.registry.validateRevision(revision);
      addEntity(revisions, revision, 'Component revision');
    }
    selectCurrentRevisions([...revisions.values()]);
    for (const item of registration.items)
      this.registry.validateComposition(item, [...revisions.values()]);
    return { items, revisions };
  }

  private commit(state: {
    items: Map<ItemId, Item>;
    revisions: Map<ComponentRevisionId, ComponentRevision>;
  }): void {
    this.#items = state.items;
    this.#revisions = state.revisions;
  }
}

function addEntity<Value extends { readonly id: string }>(
  entities: Map<string, Value>,
  entity: Value,
  name: string,
): void {
  const existing = entities.get(entity.id);
  if (existing && existing !== entity)
    throw new ConflictError(`${name} id ${entity.id} already exists`);
  entities.set(entity.id, entity);
}

function requireEntity<Value>(
  entities: ReadonlyMap<string, Value>,
  id: string,
  name: string,
): Value {
  const entity = entities.get(id);
  if (!entity) throw new NotFoundError(`${name} ${id} does not exist`);
  return entity;
}

function findExternalEntry(entries: Iterable<Entry>, entry: Entry): Entry | undefined {
  if (entry.origin.externalId === undefined) return undefined;
  return [...entries].find(
    (candidate) =>
      candidate.origin.source === entry.origin.source &&
      candidate.origin.externalId === entry.origin.externalId,
  );
}

function assertSameContent(existing: Entry, candidate: Entry): void {
  const existingValue =
    existing.content.kind === 'text' ? existing.content.text : existing.content.url;
  const candidateValue =
    candidate.content.kind === 'text' ? candidate.content.text : candidate.content.url;
  if (existing.content.kind !== candidate.content.kind || existingValue !== candidateValue) {
    throw new ConflictError('Entry external identity was reused with different content');
  }
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
