import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { Entry } from '../../../core/knowledge/entry.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import type { SourceLocator } from '../../../core/knowledge/source.js';
import { InvalidInputError } from '../../../system/error.js';
import type { ItemDeclaration } from '../domain/declaration.js';
import type { InterpretationDraft } from '../domain/input.js';

/** Validates a provider Draft without mutating or resolving its local references. */
export function validateInterpretationDraft(
  input: InterpretationDraft,
  snapshot: KnowledgeSnapshot,
  registry: SchemaRegistry,
): void {
  required(input.entryId, 'Interpretation entryId');
  const entry = snapshot.entries.find((candidate) => candidate.id === input.entryId);
  if (!entry) throw new InvalidInputError(`Entry ${input.entryId} does not exist`);
  const declarationReferences = unique(
    input.declarations.map(({ reference }) => reference),
    'Declaration reference',
  );
  const items = input.declarations.filter(
    (declaration): declaration is ItemDeclaration => declaration.kind === 'item',
  );
  const itemReferences = new Set(items.map(({ reference }) => reference));
  const knownItems = new Set([...snapshot.items.map(({ id }) => id), ...itemReferences]);
  const componentReferences = unique(
    items.flatMap(({ components }) => components.map(({ reference }) => reference)),
    'Component reference',
  );
  const knownRevisions = new Set([
    ...snapshot.revisions.map(({ id }) => id),
    ...componentReferences,
  ]);
  const resolutions = unique(
    (input.resolutions ?? []).map(({ reference }) => reference),
    'Reference resolution',
  );

  for (const declaration of input.declarations) {
    unique(declaration.dependsOn ?? [], 'Declaration dependency');
    unique(declaration.unresolved ?? [], 'Unresolved declaration value');
    for (const dependency of declaration.dependsOn ?? []) {
      if (!declarationReferences.has(dependency))
        throw new InvalidInputError(`Declaration dependency ${dependency} does not exist`);
      if (dependency === declaration.reference)
        throw new InvalidInputError('Declaration cannot depend on itself');
    }
    if (declaration.kind === 'item')
      validateItem(declaration, entry, knownItems, knownRevisions, resolutions, registry);
  }

  for (const resolution of input.resolutions ?? []) {
    if (!itemReferences.has(resolution.reference))
      throw new InvalidInputError(`Item reference ${resolution.reference} does not exist`);
    required(resolution.question, 'Reference resolution question');
    unique(resolution.candidateItemIds, 'Reference resolution candidate');
    for (const id of resolution.candidateItemIds)
      if (!snapshot.items.some((item) => item.id === id))
        throw new InvalidInputError(`Item ${id} does not exist`);
  }
  for (const decision of input.decisions ?? [])
    if (!itemReferences.has(decision.reference))
      throw new InvalidInputError(`Item reference ${decision.reference} does not exist`);
}

function validateItem(
  item: ItemDeclaration,
  entry: Entry,
  knownItems: ReadonlySet<string>,
  knownRevisions: ReadonlySet<string>,
  resolutions: ReadonlySet<string>,
  registry: SchemaRegistry,
): void {
  if (item.profile) registry.requireProfile(item.profile.key, item.profile.version);
  if (item.referenceStatus === 'uncertain' && !resolutions.has(item.reference))
    throw new InvalidInputError(
      `Uncertain Item reference ${item.reference} requires a reference resolution`,
    );
  if (item.referenceStatus === 'identified' && resolutions.has(item.reference))
    throw new InvalidInputError(
      `Identified Item reference ${item.reference} cannot request a reference resolution`,
    );
  unique(
    item.components.map(({ key }) => key),
    'Declared Component key',
  );
  for (const component of item.components) {
    registry.requireComponent(component.key, component.schemaVersion).validate(component.value);
    validateLocators(entry, component.sourceLocators);
    validateQuote(entry, component.key, component.value);
    validateItemReferences(component.value, knownItems);
    if (component.supersedesReference && !knownRevisions.has(component.supersedesReference))
      throw new InvalidInputError(
        `Component reference ${component.supersedesReference} does not exist`,
      );
  }
}

function validateItemReferences(value: ComponentValue, known: ReadonlySet<string>): void {
  if (!value || typeof value !== 'object') return;
  const record = value as Readonly<Record<string, ComponentValue>>;
  if (!Array.isArray(value) && record.kind === 'itemReference') {
    const reference = value as { readonly itemId: string };
    if (!known.has(reference.itemId))
      throw new InvalidInputError(`Item reference ${reference.itemId} does not exist`);
    return;
  }
  for (const child of Object.values(value)) validateItemReferences(child as ComponentValue, known);
}

function validateQuote(entry: Entry, key: string, value: ComponentValue): void {
  if (key !== 'quote') return;
  if (
    typeof value !== 'string' ||
    entry.content.kind !== 'text' ||
    !entry.content.text.includes(value)
  )
    throw new InvalidInputError('Quote Component must exactly match text from its Entry');
}

function validateLocators(entry: Entry, locators: readonly SourceLocator[] = []): void {
  if (locators.length === 0) return;
  if (entry.content.kind === 'url')
    throw new InvalidInputError('URL Entry cannot contain Source locators');
  const count = entry.content.text.trim().split(/\r?\n\s*\r?\n/).length;
  for (const locator of locators) {
    if (locator.kind !== 'paragraph')
      throw new InvalidInputError('Text Entry supports only paragraph Source locators');
    if (locator.paragraph > count)
      throw new InvalidInputError(`Source paragraph ${locator.paragraph} does not exist`);
  }
}

function unique(values: readonly string[], name: string): ReadonlySet<string> {
  const result = new Set<string>();
  for (const value of values) {
    required(value, name);
    if (result.has(value)) throw new InvalidInputError(`${name} ${value} is duplicated`);
    result.add(value);
  }
  return result;
}

function required(value: string, name: string): void {
  if (!normalizeText(value)) throw new InvalidInputError(`${name} cannot be empty`);
}
