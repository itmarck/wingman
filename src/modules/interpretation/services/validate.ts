import { DomainError } from '../../../core/error.js';
import { Axiom } from '../../../core/knowledge/axiom.js';
import type { Entry } from '../../../core/knowledge/entry.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import { Link } from '../../../core/knowledge/link.js';
import { Predicate } from '../../../core/knowledge/predicate.js';
import { assertPredicateTarget } from '../../../core/knowledge/rules.js';
import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import { assertValidSupersedesGraph } from '../../../core/knowledge/vigency.js';
import { ApplicationError, InvalidInputError } from '../../../system/error.js';
import type { InterpretationPredicate, RegisterInterpretationInput } from '../domain/input.js';

/**
 * Rejects an incomplete or internally inconsistent Interpretation before it can create Reviews.
 */
export function validateInterpretationDraft(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): void {
  try {
    validateDraft(input, snapshot);
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    if (error instanceof DomainError) {
      throw new InvalidInputError(error.message);
    }

    throw error;
  }
}

/**
 * Ensures that a reused Predicate keeps the definition already registered for its key.
 */
export function assertCompatiblePredicate(
  existing: Predicate,
  draft: InterpretationPredicate,
): void {
  const mode = draft.mode ?? 'descriptive';
  const isCompatible =
    existing.definition === draft.definition.trim() &&
    existing.origin === draft.origin &&
    existing.scope === draft.scope &&
    existing.mode === mode;

  if (!isCompatible) {
    throw new InvalidInputError(`Predicate ${draft.key} conflicts with its registered definition`);
  }
}

function validateDraft(input: RegisterInterpretationInput, snapshot: KnowledgeSnapshot): void {
  assertRequired(input.entryId, 'Interpretation entryId');
  const entry = snapshot.entries.find((entry) => entry.id === input.entryId);

  if (!entry) {
    throw new InvalidInputError(`Entry ${input.entryId} does not exist`);
  }

  const localConceptReferences = uniqueValues(
    input.concepts.map((concept) => concept.reference),
    'Concept reference',
  );
  const conceptReferences = new Set([
    ...localConceptReferences,
    ...snapshot.concepts.map((concept) => concept.id),
  ]);
  const axiomReferences = uniqueValues(
    input.axioms.map((axiom) => axiom.reference),
    'Axiom reference',
  );

  validateConcepts(input);
  validateReferenceResolutions(input, snapshot, localConceptReferences);
  validateDecisions(input, localConceptReferences);

  const predicates = validatePredicates(input, snapshot);

  for (const axiom of input.axioms) {
    validateSourceLocators(entry, axiom.sourceLocators);
    requireValue(conceptReferences, axiom.subjectReference, 'Concept reference');

    if (axiom.object.kind === 'concept') {
      requireValue(conceptReferences, axiom.object.conceptReference, 'Concept reference');
    }

    const predicate = requirePredicate(predicates, axiom.predicateKey);
    assertPredicateTarget(predicate, 'axiom');
    validateQuote(entry, axiom.object);

    Axiom.create({
      id: `validation.${axiom.reference}`,
      entryId: input.entryId,
      subjectConceptId: axiom.subjectReference,
      predicateId: predicate.id,
      object:
        axiom.object.kind === 'concept'
          ? {
              kind: 'concept',
              conceptId: axiom.object.conceptReference,
            }
          : axiom.object,
      sourceLocators: axiom.sourceLocators,
    });
  }

  const knownAxioms = new Set([...snapshot.axioms.map((axiom) => axiom.id), ...axiomReferences]);
  const links = [...snapshot.links];

  for (const [index, link] of (input.links ?? []).entries()) {
    validateSourceLocators(entry, link.sourceLocators);
    requireValue(knownAxioms, link.sourceReference, 'Axiom reference');
    requireValue(knownAxioms, link.targetReference, 'Axiom reference');

    const predicate = requirePredicate(predicates, link.predicateKey);
    assertPredicateTarget(predicate, 'link');

    links.push(
      Link.create({
        id: `validation.link.${index}`,
        sourceAxiomId: link.sourceReference,
        predicateId: predicate.id,
        targetAxiomId: link.targetReference,
        provenance: {
          kind: 'entry',
          entryId: input.entryId,
          sourceLocators: link.sourceLocators,
        },
      }),
    );
  }

  assertValidSupersedesGraph(links, predicates.values());
}

function validateQuote(
  entry: Entry,
  object: RegisterInterpretationInput['axioms'][number]['object'],
) {
  if (object.kind !== 'literal' || object.literal.kind !== 'quote') {
    return;
  }

  if (entry.content.kind !== 'text' || !entry.content.text.includes(object.literal.value)) {
    throw new InvalidInputError('Quote literal must exactly match text from its Entry');
  }
}

function validateSourceLocators(
  entry: Entry,
  locators: RegisterInterpretationInput['axioms'][number]['sourceLocators'],
): void {
  if (!locators || locators.length === 0) {
    return;
  }

  if (entry.content.kind === 'url') {
    throw new InvalidInputError('URL Entry cannot contain Source locators');
  }

  const paragraphCount = entry.content.text.trim().split(/\r?\n\s*\r?\n/).length;

  for (const locator of locators) {
    if (locator.kind !== 'paragraph') {
      throw new InvalidInputError('Text Entry supports only paragraph Source locators');
    }

    if (locator.paragraph > paragraphCount) {
      throw new InvalidInputError(`Source paragraph ${locator.paragraph} does not exist`);
    }
  }
}

function validateConcepts(input: RegisterInterpretationInput): void {
  const definitionsByName = new Map<string, Set<string>>();
  const requestedResolutions = new Set(
    (input.referenceResolutions ?? []).map((resolution) => resolution.reference),
  );

  for (const concept of input.concepts) {
    assertRequired(concept.reference, 'Concept reference');
    assertRequired(concept.name, 'Concept name');
    assertRequired(concept.definition, 'Concept definition');

    const name = normalizeText(concept.name);
    const definitions = definitionsByName.get(name) ?? new Set<string>();

    definitions.add(normalizeText(concept.definition));
    definitionsByName.set(name, definitions);

    if (concept.referenceStatus === 'uncertain' && !requestedResolutions.has(concept.reference)) {
      throw new InvalidInputError(
        `Uncertain Concept reference ${concept.reference} requires a reference resolution`,
      );
    }

    if (concept.referenceStatus === 'identified' && requestedResolutions.has(concept.reference)) {
      throw new InvalidInputError(
        `Identified Concept reference ${concept.reference} cannot request a reference resolution`,
      );
    }
  }

  const ambiguousName = [...definitionsByName].find(([, definitions]) => definitions.size > 1);

  if (ambiguousName) {
    throw new InvalidInputError(
      `Concept ${ambiguousName[0]} has conflicting definitions within the same Draft`,
    );
  }
}

function validateDecisions(
  input: RegisterInterpretationInput,
  conceptReferences: ReadonlySet<string>,
): void {
  const decisionReferences = uniqueValues(
    (input.referenceDecisions ?? []).map((decision) => decision.reference),
    'Reference decision',
  );

  for (const reference of decisionReferences) {
    requireValue(conceptReferences, reference, 'Concept reference');
  }
}

function validateReferenceResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  conceptReferences: ReadonlySet<string>,
): void {
  uniqueValues(
    (input.referenceResolutions ?? []).map((resolution) => resolution.reference),
    'Reference resolution',
  );
  const conceptIds = new Set(snapshot.concepts.map((concept) => concept.id));

  for (const resolution of input.referenceResolutions ?? []) {
    requireValue(conceptReferences, resolution.reference, 'Concept reference');
    assertRequired(resolution.question, 'Reference resolution question');

    const candidateIds = uniqueValues(
      resolution.candidateConceptIds,
      'Reference resolution candidate',
    );

    for (const candidateId of candidateIds) {
      requireValue(conceptIds, candidateId, 'Concept');
    }
  }
}

function validatePredicates(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): ReadonlyMap<string, Predicate> {
  uniqueValues(
    input.predicates.map((predicate) => predicate.key),
    'Predicate key',
  );

  const predicates = new Map(snapshot.predicates.map((predicate) => [predicate.key, predicate]));

  for (const draft of input.predicates) {
    const existing = predicates.get(draft.key);

    if (existing) {
      assertCompatiblePredicate(existing, draft);
      continue;
    }

    if (draft.origin === 'system') {
      throw new InvalidInputError(`System Predicate ${draft.key} is not registered`);
    }

    assertNoEquivalentPredicate(predicates.values(), draft);

    predicates.set(
      draft.key,
      Predicate.create({
        ...draft,
        id: `validation.${draft.key}`,
      }),
    );
  }

  return predicates;
}

function assertNoEquivalentPredicate(
  predicates: Iterable<Predicate>,
  draft: InterpretationPredicate,
): void {
  const mode = draft.mode ?? 'descriptive';
  const equivalent = [...predicates].find(
    (predicate) =>
      predicate.key !== draft.key &&
      predicate.hasDefinition(draft.definition) &&
      predicate.scope === draft.scope &&
      predicate.mode === mode,
  );

  if (equivalent) {
    throw new InvalidInputError(
      `Predicate ${draft.key} duplicates the registered meaning ${equivalent.key}`,
    );
  }
}

function uniqueValues(values: readonly string[], name: string): ReadonlySet<string> {
  const unique = new Set<string>();

  for (const value of values) {
    assertRequired(value, name);

    if (unique.has(value)) {
      throw new InvalidInputError(`${name} ${value} is duplicated`);
    }

    unique.add(value);
  }

  return unique;
}

function requirePredicate(predicates: ReadonlyMap<string, Predicate>, key: string): Predicate {
  const predicate = predicates.get(key);

  if (!predicate) {
    throw new InvalidInputError(`Predicate ${key} was not provided`);
  }

  return predicate;
}

function requireValue(values: ReadonlySet<string>, value: string, name: string): void {
  if (!values.has(value)) {
    throw new InvalidInputError(`${name} ${value} does not exist`);
  }
}

function assertRequired(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new InvalidInputError(`${name} cannot be empty`);
  }
}
