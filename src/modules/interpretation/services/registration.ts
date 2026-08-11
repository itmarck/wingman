import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import {
  itemReference,
  type SchemaRegistry,
  selectCurrentRevisions,
} from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import { InvalidInputError } from '../../../system/error.js';
import type { IdGenerator } from '../../../system/runtime.js';
import type { ComponentDeclaration, ItemDeclaration } from '../domain/declaration.js';
import type { InterpretationDraft, ResolutionDecision } from '../domain/input.js';
import type { ReferenceResolution } from '../domain/review.js';

export function declarationCount(input: InterpretationDraft): number {
  return input.declarations.length;
}

export function createRegistration(
  input: InterpretationDraft,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ResolutionDecision>,
  registry: SchemaRegistry,
  ids: IdGenerator,
  recordedAt: string,
) {
  const drafts = itemDeclarations(input).filter((item) => (item.unresolved?.length ?? 0) === 0);
  const references = new Map(snapshot.items.map((item) => [item.id, item]));
  const items: Item[] = [];
  for (const draft of drafts) {
    const selected = decisions.get(draft.reference)?.selectedItemId;
    const existing = selected ? references.get(selected) : findIdentityMatch(draft, snapshot);
    const item =
      existing ??
      Item.create({ id: ids.generate(), createdAt: recordedAt, profile: draft.profile });
    references.set(draft.reference, item);
    if (!snapshot.items.some((candidate) => candidate.id === item.id)) items.push(item);
  }

  const revisionReferences = new Map(
    snapshot.revisions.map((revision) => [revision.id, revision.id]),
  );
  const revisions: ComponentRevision[] = [];
  for (const draft of drafts) {
    const item = references.get(draft.reference);
    if (!item) throw new InvalidInputError(`Item reference ${draft.reference} does not exist`);
    for (const component of initializedComponents(draft, registry, recordedAt)) {
      const revision = ComponentRevision.create({
        id: ids.generate(),
        itemId: item.id,
        key: component.key,
        schemaVersion: component.schemaVersion,
        value: resolveValue(component.value, references),
        evidence: [{ entryId: input.entryId, sourceLocators: component.sourceLocators ?? [] }],
        recordedAt,
        validTime: component.validTime,
        status: component.status,
        supersedesRevisionId: component.supersedesReference
          ? revisionReferences.get(component.supersedesReference)
          : undefined,
      });
      registry.validateRevision(revision);
      revisionReferences.set(component.reference, revision.id);
      revisions.push(revision);
    }
  }
  for (const item of items)
    registry.validateComposition(item, [...snapshot.revisions, ...revisions]);
  selectCurrentRevisions([...snapshot.revisions, ...revisions]);
  return {
    registration: Object.freeze({
      items: Object.freeze(items),
      revisions: Object.freeze(revisions),
    }),
    targets: references,
    publication: Object.freeze({
      itemIds: Object.freeze(items.map((item) => item.id)),
      revisionIds: Object.freeze(revisions.map((revision) => revision.id)),
    }),
  };
}

export function findPendingResolutions(
  input: InterpretationDraft,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ResolutionDecision>,
): readonly ReferenceResolution[] {
  const items = itemDeclarations(input);
  return Object.freeze(
    (input.resolutions ?? [])
      .filter((request) => !decisions.has(request.reference))
      .map((request) => ({
        reference: request.reference,
        question: request.question,
        proposed: requireItem(items, request.reference),
        candidates: Object.freeze(
          request.candidateItemIds.map((id) => ({ id, label: itemLabel(id, snapshot) })),
        ),
      })),
  );
}

export function completeMissingResolutions(
  input: InterpretationDraft,
  snapshot: KnowledgeSnapshot,
): InterpretationDraft {
  const existing = new Set((input.resolutions ?? []).map((request) => request.reference));
  const additions = itemDeclarations(input)
    .filter((item) => item.referenceStatus === 'uncertain' && !existing.has(item.reference))
    .map((item) => ({
      reference: item.reference,
      question: `¿A qué Item corresponde ${itemLabelFromDraft(item)}?`,
      candidateItemIds: identityCandidates(item, snapshot).map((candidate) => candidate.id),
    }));
  return Object.freeze({
    ...input,
    resolutions: Object.freeze([...(input.resolutions ?? []), ...additions]),
  });
}

function itemDeclarations(input: InterpretationDraft): readonly ItemDeclaration[] {
  return input.declarations.filter(
    (declaration): declaration is ItemDeclaration => declaration.kind === 'item',
  );
}

function initializedComponents(
  item: ItemDeclaration,
  registry: SchemaRegistry,
  recordedAt: string,
) {
  if (!item.profile) return item.components;
  const profile = registry.requireProfile(item.profile.key, item.profile.version);
  const supplied = new Set(item.components.map((component) => component.key));
  const generated: ComponentDeclaration[] = (profile.initialComponents ?? [])
    .filter((component) => !supplied.has(component.key))
    .map((component) => ({
      reference: `${item.reference}.${component.key}`,
      key: component.key,
      schemaVersion: component.version,
      value: component.value,
    }));
  if (profile.lifecycle && !supplied.has(profile.lifecycle.component.key)) {
    generated.push({
      reference: `${item.reference}.${profile.lifecycle.component.key}`,
      key: profile.lifecycle.component.key,
      schemaVersion: profile.lifecycle.component.version,
      value: {
        status: profile.lifecycle.initial,
        transitions: [{ to: profile.lifecycle.initial, at: recordedAt }],
      },
    });
  }
  return [...item.components, ...generated];
}

function identityCandidates(item: ItemDeclaration, snapshot: KnowledgeSnapshot): readonly Item[] {
  const label = normalizeText(itemLabelFromDraft(item));
  const current = selectCurrentRevisions(snapshot.revisions);
  return snapshot.items.filter((candidate) =>
    current.some(
      (revision) =>
        revision.itemId === candidate.id &&
        ['name', 'aliases'].includes(revision.key) &&
        values(revision.value).some((value) => normalizeText(value) === label),
    ),
  );
}

function findIdentityMatch(item: ItemDeclaration, snapshot: KnowledgeSnapshot): Item | undefined {
  const candidates = identityCandidates(item, snapshot);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function itemLabel(id: string, snapshot: KnowledgeSnapshot): string {
  const revision = selectCurrentRevisions(snapshot.revisions).find(
    (candidate) => candidate.itemId === id && candidate.key === 'name',
  );
  return typeof revision?.value === 'string' ? revision.value : id;
}

function itemLabelFromDraft(item: ItemDeclaration): string {
  const name = item.components.find((component) => component.key === 'name')?.value;
  return typeof name === 'string' ? name : item.reference;
}

function resolveValue(
  value: ComponentValue,
  references: ReadonlyMap<string, Item>,
): ComponentValue {
  if (!value || typeof value !== 'object') return value;
  const record = value as Readonly<Record<string, ComponentValue>>;
  if (!Array.isArray(value) && record.kind === 'itemReference') {
    const reference = value as {
      readonly itemId: string;
      readonly profile?: { readonly key: string; readonly version: number };
    };
    const item = references.get(reference.itemId);
    if (!item) throw new InvalidInputError(`Item reference ${reference.itemId} does not exist`);
    return itemReference(item.id, reference.profile);
  }
  if (Array.isArray(value))
    return Object.freeze(value.map((child) => resolveValue(child, references)));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveValue(child, references)]),
    ),
  );
}

function values(value: ComponentValue): readonly string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((candidate): candidate is string => typeof candidate === 'string')
    : [];
}

function requireItem(items: readonly ItemDeclaration[], reference: string): ItemDeclaration {
  const item = items.find((candidate) => candidate.reference === reference);
  if (!item) throw new InvalidInputError(`Item reference ${reference} does not exist`);
  return item;
}
