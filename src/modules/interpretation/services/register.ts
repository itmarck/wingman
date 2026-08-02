import { Axiom, type AxiomObject } from '../../../core/knowledge/axiom.js';
import { Concept } from '../../../core/knowledge/concept.js';
import { findDuplicateAxiom, findDuplicateLink } from '../../../core/knowledge/duplicate.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import { Link } from '../../../core/knowledge/link.js';
import { Predicate } from '../../../core/knowledge/predicate.js';
import { type ConceptResolution, resolveConcept } from '../../../core/knowledge/resolve.js';
import { assertPredicateTarget } from '../../../core/knowledge/rules.js';
import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type {
  InterpretationAxiom,
  InterpretationConcept,
  InterpretationLink,
  InterpretationObject,
  InterpretationPredicate,
  ReferenceDecision,
  RegisterInterpretationInput,
} from '../domain/input.js';
import type { Interpretation, InterpreterIdentity } from '../domain/interpretation.js';
import { type ReferenceResolution, Review, type ReviewId } from '../domain/review.js';
import type { InterpretationLifecycle } from '../ports/lifecycle.js';
import type { InterpretationClaim } from '../ports/queue.js';
import type { ReviewStore } from '../ports/review.js';
import type {
  InterpretationPublication,
  InterpretationRegistration,
  InterpretationStore,
} from '../ports/store.js';
import { assertCompatiblePredicate, validateInterpretationDraft } from './validate.js';

export interface RegisterInterpretationResult {
  readonly interpretation: Interpretation;
  readonly reviewIds: readonly ReviewId[];
}

export interface PreparedReviewCompletion {
  readonly interpretation: Interpretation;
  readonly registration: InterpretationRegistration;
}

/**
 * Registers the structured meaning extracted from an Entry.
 */
export class RegisterInterpretationCommand {
  constructor(
    private readonly store: InterpretationStore,
    private readonly reviews: ReviewStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    interpretation: Interpretation,
    input: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const snapshot = await this.store.loadKnowledge();
    const completedInput = completeMissingReferenceResolutions(input, snapshot);

    validateInterpretationDraft(completedInput, snapshot);
    assertNoInterpreterDecisions(completedInput);
    const decisions = new Map<string, ReferenceDecision>();
    const resolutions = findReferenceResolutions(completedInput, snapshot, decisions);

    if (resolutions.length > 0) {
      const reviews = await this.createReviews(interpretation, resolutions);
      const pending = interpretation.requestReview(
        completedInput,
        interpreter,
        this.clock.now().toISOString(),
      );

      await this.lifecycle.requestReviews(pending, reviews, claim);
      return Object.freeze({
        interpretation: pending,
        reviewIds: Object.freeze(reviews.map((review) => review.id)),
      });
    }

    const prepared = this.createRegistration(completedInput, snapshot, decisions);
    assertEffectiveRegistration(prepared.registration);

    const completed = interpretation.completeKnowledge(
      completedInput,
      interpreter,
      prepared.publication,
      this.clock.now().toISOString(),
    );

    await this.lifecycle.publish(completed, prepared.registration, claim);
    return Object.freeze({
      interpretation: completed,
      reviewIds: Object.freeze([]),
    });
  }

  /**
   * Completes a valid Interpretation that explicitly found no durable knowledge.
   */
  async completeEmpty(
    interpretation: Interpretation,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<Interpretation> {
    const completed = interpretation.completeEmpty(interpreter, this.clock.now().toISOString());
    const emptyRegistration: InterpretationRegistration = Object.freeze({
      concepts: Object.freeze([]),
      predicates: Object.freeze([]),
      axioms: Object.freeze([]),
      links: Object.freeze([]),
    });

    await this.lifecycle.publish(completed, emptyRegistration, claim);
    return completed;
  }

  /**
   * Publishes a reviewed Interpretation after every ambiguity has been resolved.
   */
  async prepareReviewCompletion(
    interpretation: Interpretation,
    reviews: readonly Review[],
  ): Promise<PreparedReviewCompletion> {
    const input = requireDraft(interpretation);
    const snapshot = await this.store.loadKnowledge();
    validateInterpretationDraft(input, snapshot);
    const decisions = createReviewDecisionMap(reviews);
    const resolutions = findReferenceResolutions(input, snapshot, decisions);

    if (resolutions.length > 0) {
      throw new ConflictError(
        `Interpretation ${interpretation.id} still has unresolved references`,
      );
    }

    const prepared = this.createRegistration(input, snapshot, decisions);
    assertEffectiveRegistration(prepared.registration);

    const completed = interpretation.completeReview(
      [...decisions.values()],
      prepared.publication,
      this.clock.now().toISOString(),
    );

    return Object.freeze({
      interpretation: completed,
      registration: prepared.registration,
    });
  }

  private createRegistration(
    input: RegisterInterpretationInput,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ReferenceDecision>,
  ): PreparedInterpretation {
    const concepts = [...snapshot.concepts];
    const conceptReferences = new Map(snapshot.concepts.map((concept) => [concept.id, concept]));
    const newConcepts: Concept[] = [];

    for (const draft of input.concepts) {
      const concept = this.resolveConcept(draft, concepts, decisions);

      setReference(conceptReferences, draft.reference, concept);
      replaceEntity(concepts, concept);

      if (!snapshot.concepts.includes(concept)) {
        newConcepts.push(concept);
      }
    }

    const predicates = [...snapshot.predicates];
    const newPredicates: Predicate[] = [];

    for (const draft of input.predicates) {
      const predicate = this.resolvePredicate(draft, predicates);

      predicates.push(predicate);

      if (!snapshot.predicates.includes(predicate)) {
        newPredicates.push(predicate);
      }
    }

    const axioms = [...snapshot.axioms];
    const axiomReferences = new Map(snapshot.axioms.map((axiom) => [axiom.id, axiom]));
    const newAxioms: Axiom[] = [];
    const publishedAxioms: Axiom[] = [];

    for (const draft of input.axioms) {
      const axiom = this.createAxiom(input.entryId, draft, conceptReferences, predicates, axioms);

      setReference(axiomReferences, draft.reference, axiom);
      axioms.push(axiom);
      publishedAxioms.push(axiom);

      if (!snapshot.axioms.includes(axiom)) {
        newAxioms.push(axiom);
      }
    }

    const links = [...snapshot.links];
    const newLinks: Link[] = [];
    const publishedLinks: Link[] = [];

    for (const draft of input.links ?? []) {
      const link = this.createLink(input.entryId, draft, axiomReferences, predicates, links);

      links.push(link);
      publishedLinks.push(link);

      if (!snapshot.links.includes(link)) {
        newLinks.push(link);
      }
    }

    return {
      registration: {
        concepts: uniqueEntities(newConcepts),
        predicates: uniqueEntities(newPredicates),
        axioms: uniqueEntities(newAxioms),
        links: uniqueEntities(newLinks),
      },
      publication: {
        conceptIds: uniqueIds(
          conceptReferencesUsedBy(input).map((reference) =>
            requireReference(conceptReferences, reference, 'Concept'),
          ),
        ),
        predicateIds: uniqueIds(
          [
            ...input.predicates.map((draft) => draft.key),
            ...input.axioms.map((draft) => draft.predicateKey),
            ...(input.links ?? []).map((draft) => draft.predicateKey),
          ].map((key) => requirePredicate(predicates, key)),
        ),
        axiomIds: uniqueIds(publishedAxioms),
        linkIds: uniqueIds(publishedLinks),
      },
    };
  }

  private async createReviews(
    interpretation: Interpretation,
    resolutions: readonly ReferenceResolution[],
  ): Promise<readonly Review[]> {
    const existing = await this.reviews.findPendingReviews(interpretation.id);

    if (existing.length > 0) {
      return existing;
    }

    const createdAt = this.clock.now().toISOString();
    const reviews = resolutions.map((resolution) =>
      Review.createInterpretation({
        id: this.ids.generate(),
        interpretationId: interpretation.id,
        entryId: interpretation.entryId,
        resolution,
        createdAt,
      }),
    );

    return Object.freeze(reviews);
  }

  private resolveConcept(
    draft: InterpretationConcept,
    concepts: readonly Concept[],
    decisions: ReadonlyMap<string, ReferenceDecision>,
  ): Concept {
    const resolution = resolveConcept(concepts, draft.name, draft.definition);
    const decision = decisions.get(draft.reference);

    if (decisions.has(draft.reference)) {
      return resolveDecision(draft, resolution, decision, concepts, this.ids);
    }

    if (resolution.status === 'ambiguous') {
      throw new ConflictError(`Concept ${draft.name} requires a Review`);
    }

    if (resolution.status === 'matched') {
      return addDraftAliases(
        requireFirst(resolution.candidates, `Concept ${draft.name} has no match`),
        draft,
      );
    }

    return Concept.create({
      ...draft,
      id: this.ids.generate(),
    });
  }

  private resolvePredicate(
    draft: InterpretationPredicate,
    predicates: readonly Predicate[],
  ): Predicate {
    const existing = predicates.find((predicate) => predicate.key === draft.key);

    if (existing) {
      assertCompatiblePredicate(existing, draft);
      return existing;
    }

    if (draft.origin === 'system') {
      throw new InvalidInputError(`System Predicate ${draft.key} is not registered`);
    }

    const equivalent = predicates.find(
      (predicate) =>
        predicate.hasDefinition(draft.definition) &&
        predicate.scope === draft.scope &&
        predicate.mode === (draft.mode ?? 'descriptive'),
    );

    if (equivalent) {
      throw new InvalidInputError(
        `Predicate ${draft.key} duplicates the registered meaning ${equivalent.key}`,
      );
    }

    return Predicate.create({
      ...draft,
      id: this.ids.generate(),
    });
  }

  private createAxiom(
    entryId: string,
    draft: InterpretationAxiom,
    concepts: ReadonlyMap<string, Concept>,
    predicates: readonly Predicate[],
    axioms: readonly Axiom[],
  ): Axiom {
    const predicate = requirePredicate(predicates, draft.predicateKey);
    const candidate = Axiom.create({
      id: this.ids.generate(),
      entryId,
      subjectConceptId: requireReference(concepts, draft.subjectReference, 'Concept').id,
      predicateId: predicate.id,
      object: resolveObject(draft.object, concepts),
      sourceLocators: draft.sourceLocators,
    });

    assertPredicateTarget(predicate, 'axiom');

    return findDuplicateAxiom(axioms, candidate) ?? candidate;
  }

  private createLink(
    entryId: string,
    draft: InterpretationLink,
    axioms: ReadonlyMap<string, Axiom>,
    predicates: readonly Predicate[],
    links: readonly Link[],
  ): Link {
    const predicate = requirePredicate(predicates, draft.predicateKey);
    const candidate = Link.create({
      id: this.ids.generate(),
      sourceAxiomId: requireReference(axioms, draft.sourceReference, 'Axiom').id,
      predicateId: predicate.id,
      targetAxiomId: requireReference(axioms, draft.targetReference, 'Axiom').id,
      provenance: {
        kind: 'entry',
        entryId,
        sourceLocators: draft.sourceLocators,
      },
    });

    assertPredicateTarget(predicate, 'link');

    return findDuplicateLink(links, candidate) ?? candidate;
  }
}

/**
 * Supplies a safe generic Review request when inference marks a Concept uncertain but omits it.
 */
function completeMissingReferenceResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): RegisterInterpretationInput {
  const concepts = input.concepts.map((concept) =>
    isAnonymousPersonPlaceholder(concept)
      ? Object.freeze({
          ...concept,
          referenceStatus: 'uncertain' as const,
        })
      : concept,
  );
  const requested = new Set(
    (input.referenceResolutions ?? []).map((resolution) => resolution.reference),
  );
  const missing = concepts
    .filter(
      (concept) => concept.referenceStatus === 'uncertain' && !requested.has(concept.reference),
    )
    .map((concept) => {
      const resolution = resolveConcept(snapshot.concepts, concept.name, concept.definition);

      return Object.freeze({
        reference: concept.reference,
        question: `¿A qué concepto se refiere «${concept.name}»?`,
        candidateConceptIds: Object.freeze(resolution.candidates.map((candidate) => candidate.id)),
      });
    });

  const changedConcept = concepts.some((concept, index) => concept !== input.concepts[index]);

  if (missing.length === 0 && !changedConcept) {
    return input;
  }

  return Object.freeze({
    ...input,
    concepts: Object.freeze(concepts),
    referenceResolutions: Object.freeze([...(input.referenceResolutions ?? []), ...missing]),
  });
}

function isAnonymousPersonPlaceholder(concept: InterpretationConcept): boolean {
  const name = normalizeText(concept.name);
  const metadata = normalizeText(
    [concept.name, concept.definition, ...(concept.aliases ?? [])].join(' '),
  );
  const genericPerson =
    /^(persona|creador|creadora|autor|autora|individuo|person|creator|author)\b/;
  const unknownIdentity =
    /\b(desconocido|desconocida|anónimo|anónima|no identificado|no identificada|sin identificar|identidad no indicada|identidad desconocida|unknown|unnamed|unidentified|anonymous)\b/;

  return genericPerson.test(name) && unknownIdentity.test(metadata);
}

function findReferenceResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ReferenceDecision>,
): readonly ReferenceResolution[] {
  const requested = new Map(
    (input.referenceResolutions ?? []).map((resolution) => [resolution.reference, resolution]),
  );

  return Object.freeze(
    input.concepts.flatMap((concept) => {
      if (decisions.has(concept.reference)) {
        return [];
      }

      const resolution = resolveConcept(snapshot.concepts, concept.name, concept.definition);
      const request = requested.get(concept.reference);

      if (!request && resolution.status !== 'ambiguous') {
        return [];
      }

      const requestedCandidates = (request?.candidateConceptIds ?? []).map((id) => {
        const candidate = snapshot.concepts.find((concept) => concept.id === id);

        if (!candidate) {
          throw new InvalidInputError(`Concept ${id} is not a reference resolution candidate`);
        }

        return candidate;
      });
      const candidates =
        resolution.status === 'ambiguous'
          ? uniqueEntities([...requestedCandidates, ...resolution.candidates])
          : uniqueEntities(requestedCandidates);

      return [
        {
          reference: concept.reference,
          question:
            request?.question ??
            `¿A qué Concept corresponde la referencia "${concept.reference}" (${concept.name})?`,
          proposed: concept,
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            aliases: candidate.aliases,
            definition: candidate.definition,
          })),
        },
      ];
    }),
  );
}

function resolveDecision(
  draft: InterpretationConcept,
  resolution: ConceptResolution,
  decision: ReferenceDecision | undefined,
  concepts: readonly Concept[],
  ids: IdGenerator,
): Concept {
  if (decision?.selectedConceptId === undefined) {
    if (resolution.status === 'matched') {
      return addDraftAliases(
        requireFirst(resolution.candidates, `Concept ${draft.name} has no match`),
        draft,
      );
    }

    return Concept.create({
      ...draft,
      id: ids.generate(),
    });
  }

  const selected = concepts.find((candidate) => candidate.id === decision.selectedConceptId);

  if (!selected) {
    throw new InvalidInputError(`Concept ${decision.selectedConceptId} is not a valid candidate`);
  }

  return addDraftAliases(selected, draft);
}

function addDraftAliases(concept: Concept, draft: InterpretationConcept): Concept {
  return concept.addAliases([draft.name, ...(draft.aliases ?? [])]);
}

function assertNoInterpreterDecisions(input: RegisterInterpretationInput): void {
  if ((input.referenceDecisions?.length ?? 0) > 0) {
    throw new InvalidInputError('Interpreter Draft cannot contain Reference decisions');
  }
}

function createReviewDecisionMap(
  reviews: readonly Review[],
): ReadonlyMap<string, ReferenceDecision> {
  const decisions = reviews.map((review) => {
    if (review.status !== 'resolved' || !review.decision) {
      throw new ConflictError(`Review ${review.id} is still pending`);
    }

    return review.decision;
  });

  return new Map(decisions.map((decision) => [decision.reference, decision]));
}

function requireDraft(interpretation: Interpretation): RegisterInterpretationInput {
  if (!interpretation.draft) {
    throw new ConflictError(`Interpretation ${interpretation.id} has no draft`);
  }

  return interpretation.draft;
}

function resolveObject(
  object: InterpretationObject,
  concepts: ReadonlyMap<string, Concept>,
): AxiomObject {
  if (object.kind === 'concept') {
    return {
      kind: 'concept',
      conceptId: requireReference(concepts, object.conceptReference, 'Concept').id,
    };
  }

  return {
    kind: 'literal',
    literal: object.literal,
  };
}

function requirePredicate(predicates: readonly Predicate[], key: string): Predicate {
  const predicate = predicates.find((candidate) => candidate.key === key);

  if (!predicate) {
    throw new InvalidInputError(`Predicate ${key} was not provided`);
  }

  return predicate;
}

function setReference<Value extends { readonly id: string }>(
  references: Map<string, Value>,
  key: string,
  value: Value,
): void {
  const existing = references.get(key);

  if (existing?.id === value.id) {
    return;
  }

  if (existing) {
    throw new InvalidInputError(`Reference ${key} is duplicated`);
  }

  references.set(key, value);
}

function requireReference<Value>(
  references: ReadonlyMap<string, Value>,
  key: string,
  name: string,
): Value {
  const value = references.get(key);

  if (!value) {
    throw new InvalidInputError(`${name} reference ${key} does not exist`);
  }

  return value;
}

function requireFirst<Value>(values: readonly Value[], message: string): Value {
  const value = values[0];

  if (!value) {
    throw new InvalidInputError(message);
  }

  return value;
}

function uniqueEntities<Value extends { readonly id: string }>(
  entities: readonly Value[],
): readonly Value[] {
  return Object.freeze([...new Map(entities.map((entity) => [entity.id, entity])).values()]);
}

interface PreparedInterpretation {
  readonly registration: InterpretationRegistration;
  readonly publication: InterpretationPublication;
}

function assertEffectiveRegistration(registration: InterpretationRegistration): void {
  const hasChanges =
    registration.concepts.length > 0 ||
    registration.predicates.length > 0 ||
    registration.axioms.length > 0 ||
    registration.links.length > 0;

  if (!hasChanges) {
    throw new InvalidInputError('Interpretation Draft does not produce new knowledge');
  }
}

function uniqueIds(entities: readonly { readonly id: string }[]): readonly string[] {
  return Object.freeze([...new Set(entities.map((entity) => entity.id))]);
}

function conceptReferencesUsedBy(input: RegisterInterpretationInput): readonly string[] {
  return [
    ...input.concepts.map((concept) => concept.reference),
    ...input.axioms.flatMap((axiom) => [
      axiom.subjectReference,
      ...(axiom.object.kind === 'concept' ? [axiom.object.conceptReference] : []),
    ]),
  ];
}

function replaceEntity<Value extends { readonly id: string }>(
  entities: Value[],
  replacement: Value,
): void {
  const index = entities.findIndex((entity) => entity.id === replacement.id);

  if (index === -1) {
    entities.push(replacement);
    return;
  }

  entities[index] = replacement;
}
