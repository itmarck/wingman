import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { Entry } from '../../../core/knowledge/entry.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import type { SourceLocator } from '../../../core/knowledge/source.js';
import { InvalidInputError } from '../../../system/error.js';
import type { InterpretationDeclaration } from '../domain/declaration.js';
import type { RegisterInterpretationInput } from '../domain/input.js';

/** Validates a provider Draft without mutating or resolving its local references. */
export function validateInterpretationDraft(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  registry: SchemaRegistry,
): void {
  required(input.entryId, 'Interpretation entryId');
  const entry = snapshot.entries.find((candidate) => candidate.id === input.entryId);
  if (!entry) throw new InvalidInputError(`Entry ${input.entryId} does not exist`);
  const itemReferences = unique(
    input.items.map((item) => item.reference),
    'Item reference',
  );
  const knownItems = new Set([...snapshot.items.map((item) => item.id), ...itemReferences]);
  const componentReferences = unique(
    input.components.map((component) => component.reference),
    'Component reference',
  );
  const knownRevisions = new Set([
    ...snapshot.revisions.map((revision) => revision.id),
    ...componentReferences,
  ]);
  const resolutions = unique(
    (input.referenceResolutions ?? []).map((resolution) => resolution.reference),
    'Reference resolution',
  );

  for (const item of input.items) {
    required(item.reference, 'Item reference');
    if (item.profile) registry.requireProfile(item.profile.key, item.profile.version);
    if (item.referenceStatus === 'uncertain' && !resolutions.has(item.reference)) {
      throw new InvalidInputError(
        `Uncertain Item reference ${item.reference} requires a reference resolution`,
      );
    }
    if (item.referenceStatus === 'identified' && resolutions.has(item.reference)) {
      throw new InvalidInputError(
        `Identified Item reference ${item.reference} cannot request a reference resolution`,
      );
    }
  }

  for (const component of input.components) {
    required(component.itemReference, 'Component itemReference');
    if (!knownItems.has(component.itemReference))
      throw new InvalidInputError(`Item reference ${component.itemReference} does not exist`);
    registry.requireComponent(component.key, component.schemaVersion).validate(component.value);
    validateLocators(entry, component.sourceLocators);
    validateQuote(entry, component.key, component.value);
    validateItemReferences(component.value, knownItems);
    if (component.supersedesReference && !knownRevisions.has(component.supersedesReference)) {
      throw new InvalidInputError(
        `Component reference ${component.supersedesReference} does not exist`,
      );
    }
  }

  for (const resolution of input.referenceResolutions ?? []) {
    if (!itemReferences.has(resolution.reference))
      throw new InvalidInputError(`Item reference ${resolution.reference} does not exist`);
    required(resolution.question, 'Reference resolution question');
    unique(resolution.candidateItemIds, 'Reference resolution candidate');
    for (const id of resolution.candidateItemIds)
      if (!snapshot.items.some((item) => item.id === id))
        throw new InvalidInputError(`Item ${id} does not exist`);
  }

  for (const decision of input.referenceDecisions ?? []) {
    if (!itemReferences.has(decision.reference))
      throw new InvalidInputError(`Item reference ${decision.reference} does not exist`);
  }

  validateDeclarations(input.declarations, registry);
}

function validateDeclarations(
  declarations: RegisterInterpretationInput['declarations'],
  registry: SchemaRegistry,
): void {
  if (!declarations) return;
  const all: InterpretationDeclaration[] = [
    ...declarations.items,
    ...declarations.states,
    ...declarations.automations,
    ...declarations.intents,
  ];
  for (const [kind, values] of [
    ['item', declarations.items],
    ['state', declarations.states],
    ['automation', declarations.automations],
    ['intent', declarations.intents],
  ] as const)
    if (values.some((declaration) => declaration.kind !== kind))
      throw new InvalidInputError(`Declaration collection ${kind} contains another kind`);
  const references = unique(
    all.map(({ reference }) => reference),
    'Declaration reference',
  );
  for (const declaration of all) {
    unique(declaration.dependsOn ?? [], 'Declaration dependency');
    unique(declaration.unresolved ?? [], 'Unresolved declaration value');
    for (const dependency of declaration.dependsOn ?? []) {
      if (!references.has(dependency))
        throw new InvalidInputError(`Declaration dependency ${dependency} does not exist`);
      if (dependency === declaration.reference)
        throw new InvalidInputError('Declaration cannot depend on itself');
    }
    if (declaration.kind === 'item') {
      registry.requireProfile(declaration.profile.key, declaration.profile.version);
      unique(
        declaration.components.map(({ key }) => key),
        'Declared Component key',
      );
      for (const component of declaration.components)
        registry.requireComponent(component.key, component.version).validate(component.value);
    }
  }
}

function validateItemReferences(value: ComponentValue, known: ReadonlySet<string>): void {
  if (!value || typeof value !== 'object') return;
  if (
    !Array.isArray(value) &&
    (value as Readonly<Record<string, ComponentValue>>).kind === 'itemReference'
  ) {
    const reference = value as { readonly kind: 'itemReference'; readonly itemId: string };
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
  ) {
    throw new InvalidInputError('Quote Component must exactly match text from its Entry');
  }
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
