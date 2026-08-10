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
import type {
  InterpretationItem,
  ReferenceDecision,
  RegisterInterpretationInput,
} from '../domain/input.js';
import type { ReferenceResolution } from '../domain/review.js';

export function declarationCount(input: RegisterInterpretationInput): number {
  const declarations = input.declarations;
  return declarations
    ? declarations.items.length +
        declarations.states.length +
        declarations.automations.length +
        declarations.intents.length
    : 0;
}

export function createRegistration(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ReferenceDecision>,
  registry: SchemaRegistry,
  ids: IdGenerator,
  recordedAt: string,
) {
  const references = new Map(snapshot.items.map((item) => [item.id, item]));
  const items: Item[] = [];
  for (const draft of input.items) {
    const selected = decisions.get(draft.reference)?.selectedItemId;
    const existing = selected
      ? references.get(selected)
      : findIdentityMatch(draft, input, snapshot);
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
  for (const draft of input.components) {
    const item = references.get(draft.itemReference);
    if (!item) throw new InvalidInputError(`Item reference ${draft.itemReference} does not exist`);
    const revision = ComponentRevision.create({
      id: ids.generate(),
      itemId: item.id,
      key: draft.key,
      schemaVersion: draft.schemaVersion,
      value: resolveValue(draft.value, references),
      evidence: [{ entryId: input.entryId, sourceLocators: draft.sourceLocators ?? [] }],
      recordedAt,
      validTime: draft.validTime,
      status: draft.status,
      supersedesRevisionId: draft.supersedesReference
        ? revisionReferences.get(draft.supersedesReference)
        : undefined,
    });
    registry.validateRevision(revision);
    revisionReferences.set(draft.reference, revision.id);
    revisions.push(revision);
  }
  for (const item of items)
    registry.validateComposition(item, [...snapshot.revisions, ...revisions]);
  selectCurrentRevisions([...snapshot.revisions, ...revisions]);
  return {
    registration: Object.freeze({
      items: Object.freeze(items),
      revisions: Object.freeze(revisions),
    }),
    publication: Object.freeze({
      itemIds: Object.freeze(items.map((item) => item.id)),
      revisionIds: Object.freeze(revisions.map((revision) => revision.id)),
    }),
  };
}

export function findPendingResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ReferenceDecision>,
): readonly ReferenceResolution[] {
  return Object.freeze(
    (input.referenceResolutions ?? [])
      .filter((request) => !decisions.has(request.reference))
      .map((request) => ({
        reference: request.reference,
        question: request.question,
        proposed: requireItem(input.items, request.reference),
        candidates: Object.freeze(
          request.candidateItemIds.map((id) => ({ id, label: itemLabel(id, snapshot) })),
        ),
      })),
  );
}

export function completeMissingResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): RegisterInterpretationInput {
  const existing = new Set((input.referenceResolutions ?? []).map((request) => request.reference));
  const additions = input.items
    .filter((item) => item.referenceStatus === 'uncertain' && !existing.has(item.reference))
    .map((item) => ({
      reference: item.reference,
      question: `¿A qué Item corresponde ${itemLabelFromDraft(item, input)}?`,
      candidateItemIds: identityCandidates(item, input, snapshot).map((candidate) => candidate.id),
    }));
  return Object.freeze({
    ...input,
    referenceResolutions: Object.freeze([...(input.referenceResolutions ?? []), ...additions]),
  });
}

function identityCandidates(
  item: InterpretationItem,
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): readonly Item[] {
  const label = normalizeText(itemLabelFromDraft(item, input));
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

function findIdentityMatch(
  item: InterpretationItem,
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): Item | undefined {
  const candidates = identityCandidates(item, input, snapshot);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function itemLabel(id: string, snapshot: KnowledgeSnapshot): string {
  const revision = selectCurrentRevisions(snapshot.revisions).find(
    (candidate) => candidate.itemId === id && candidate.key === 'name',
  );
  return typeof revision?.value === 'string' ? revision.value : id;
}

function itemLabelFromDraft(item: InterpretationItem, input: RegisterInterpretationInput): string {
  const name = input.components.find(
    (component) => component.itemReference === item.reference && component.key === 'name',
  )?.value;
  return typeof name === 'string' ? name : item.reference;
}

function resolveValue(
  value: ComponentValue,
  references: ReadonlyMap<string, Item>,
): ComponentValue {
  if (!value || typeof value !== 'object') return value;
  if (
    !Array.isArray(value) &&
    (value as Readonly<Record<string, ComponentValue>>).kind === 'itemReference'
  ) {
    const reference = value as {
      readonly kind: 'itemReference';
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
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((child): child is string => typeof child === 'string')
      : [];
}

function requireItem(items: readonly InterpretationItem[], reference: string): InterpretationItem {
  const item = items.find((candidate) => candidate.reference === reference);
  if (!item) throw new InvalidInputError(`Item reference ${reference} does not exist`);
  return item;
}
