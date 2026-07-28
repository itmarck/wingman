import { createPage } from '../../../../adapters/memory/page.js';
import type { Axiom, AxiomId } from '../../../../core/knowledge/axiom.js';
import type { Concept, ConceptId } from '../../../../core/knowledge/concept.js';
import { findDuplicateAxiom, findDuplicateLink } from '../../../../core/knowledge/duplicate.js';
import type { Entry, EntryId } from '../../../../core/knowledge/entry.js';
import type { Link, LinkId } from '../../../../core/knowledge/link.js';
import type { Predicate, PredicateId } from '../../../../core/knowledge/predicate.js';
import { assertPredicateTarget } from '../../../../core/knowledge/rules.js';
import type { KnowledgeSnapshot } from '../../../../core/knowledge/snapshot.js';
import { createSystemPredicates } from '../../../../core/knowledge/system.js';
import { assertValidSupersedesGraph } from '../../../../core/knowledge/vigency.js';
import { ConflictError, NotFoundError } from '../../../../system/error.js';
import type { Page, PageRequest } from '../../../../system/page.js';
import type { EntryStore } from '../../../capture/ports/store.js';
import type { Intent, IntentId } from '../../../intent/domain/intent.js';
import type { IntentStore } from '../../../intent/ports/store.js';
import type {
  InterpretationRegistration,
  InterpretationStore,
} from '../../../interpretation/ports/store.js';
import type {
  InterpretationContext,
  InterpretationContextSource,
} from '../../../interpretation/services/context.js';
import type { ProjectionSource } from '../../../projection/ports/source.js';
import type { ConceptStore } from '../../ports/store.js';

/**
 * Coherent in-memory persistence shared through narrow module contracts.
 */
export class MemoryKnowledgeStore
  implements
    EntryStore,
    ConceptStore,
    InterpretationStore,
    IntentStore,
    ProjectionSource,
    InterpretationContextSource
{
  #entries = new Map<EntryId, Entry>();
  #concepts = new Map<ConceptId, Concept>();
  #predicates = new Map<PredicateId, Predicate>(
    createSystemPredicates().map((predicate) => [predicate.id, predicate]),
  );
  #axioms = new Map<AxiomId, Axiom>();
  #links = new Map<LinkId, Link>();
  #intents = new Map<IntentId, Intent>();

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

  async saveConcept(concept: Concept): Promise<void> {
    addConcept(this.#concepts, concept);
  }

  async findConcepts(name: string): Promise<readonly Concept[]> {
    return Object.freeze([...this.#concepts.values()].filter((concept) => concept.matches(name)));
  }

  async loadKnowledge(): Promise<KnowledgeSnapshot> {
    return Object.freeze({
      entries: Object.freeze([...this.#entries.values()]),
      concepts: Object.freeze([...this.#concepts.values()]),
      predicates: Object.freeze([...this.#predicates.values()]),
      axioms: Object.freeze([...this.#axioms.values()]),
      links: Object.freeze([...this.#links.values()]),
    });
  }

  async findInterpretationContext(entry: Entry): Promise<InterpretationContext> {
    const content = entry.content.kind === 'text' ? entry.content.text : entry.content.url;
    const relatedConcepts = [...this.#concepts.values()].filter((concept) =>
      [concept.name, ...concept.aliases].some((name) => containsText(content, name)),
    );
    const conceptIds = new Set(relatedConcepts.map((concept) => concept.id));
    const relatedAxioms = [...this.#axioms.values()].filter((axiom) => {
      const referencesSubject = conceptIds.has(axiom.subjectConceptId);
      const referencesObject =
        axiom.object.kind === 'concept' && conceptIds.has(axiom.object.conceptId);

      return referencesSubject || referencesObject;
    });

    for (const axiom of relatedAxioms) {
      conceptIds.add(axiom.subjectConceptId);

      if (axiom.object.kind === 'concept') {
        conceptIds.add(axiom.object.conceptId);
      }
    }

    return Object.freeze({
      concepts: Object.freeze(
        [...this.#concepts.values()].filter((concept) => conceptIds.has(concept.id)),
      ),
      predicates: Object.freeze([...this.#predicates.values()]),
      axioms: Object.freeze(relatedAxioms),
    });
  }

  async saveInterpretation(registration: InterpretationRegistration): Promise<void> {
    this.commitInterpretation(this.prepareInterpretation(registration));
  }

  private prepareInterpretation(registration: InterpretationRegistration): InterpretationState {
    const concepts = new Map(this.#concepts);
    const predicates = new Map(this.#predicates);
    const axioms = new Map(this.#axioms);
    const links = new Map(this.#links);

    for (const concept of registration.concepts) {
      addConcept(concepts, concept);
    }

    for (const predicate of registration.predicates) {
      addPredicate(predicates, predicate);
    }

    for (const axiom of registration.axioms) {
      requireEntity(this.#entries, axiom.entryId, 'Entry');
      requireEntity(concepts, axiom.subjectConceptId, 'Concept');

      if (axiom.object.kind === 'concept') {
        requireEntity(concepts, axiom.object.conceptId, 'Concept');
      }

      assertPredicateTarget(requireEntity(predicates, axiom.predicateId, 'Predicate'), 'axiom');

      if (!findDuplicateAxiom(axioms.values(), axiom)) {
        addEntity(axioms, axiom, 'Axiom');
      }
    }

    for (const link of registration.links) {
      requireEntity(axioms, link.sourceAxiomId, 'Axiom');
      requireEntity(axioms, link.targetAxiomId, 'Axiom');
      assertPredicateTarget(requireEntity(predicates, link.predicateId, 'Predicate'), 'link');

      if (link.provenance.kind === 'entry') {
        requireEntity(this.#entries, link.provenance.entryId, 'Entry');
      } else {
        for (const axiomId of link.provenance.evidenceAxiomIds) {
          requireEntity(axioms, axiomId, 'Axiom');
        }
      }

      if (!findDuplicateLink(links.values(), link)) {
        addEntity(links, link, 'Link');
      }
    }

    assertValidSupersedesGraph(links.values(), predicates.values());

    return {
      concepts,
      predicates,
      axioms,
      links,
    };
  }

  private commitInterpretation(state: InterpretationState): void {
    this.#concepts = state.concepts;
    this.#predicates = state.predicates;
    this.#axioms = state.axioms;
    this.#links = state.links;
  }

  async saveIntent(intent: Intent): Promise<void> {
    requireEntity(this.#entries, intent.entryId, 'Entry');

    for (const axiomId of intent.axiomIds) {
      requireEntity(this.#axioms, axiomId, 'Axiom');
    }

    addEntity(this.#intents, intent, 'Intent');
  }

  listIntents(): readonly Intent[] {
    return Object.freeze([...this.#intents.values()]);
  }
}

interface Entity {
  readonly id: string;
}

interface InterpretationState {
  readonly concepts: Map<ConceptId, Concept>;
  readonly predicates: Map<PredicateId, Predicate>;
  readonly axioms: Map<AxiomId, Axiom>;
  readonly links: Map<LinkId, Link>;
}

function addEntity<Value extends Entity>(
  entities: Map<string, Value>,
  entity: Value,
  name: string,
): void {
  const existing = entities.get(entity.id);

  if (existing && existing !== entity) {
    throw new ConflictError(`${name} id ${entity.id} already exists`);
  }

  entities.set(entity.id, entity);
}

function addPredicate(predicates: Map<PredicateId, Predicate>, predicate: Predicate): void {
  const duplicateKey = [...predicates.values()].find(
    (candidate) => candidate.key === predicate.key,
  );

  if (duplicateKey && duplicateKey.id !== predicate.id) {
    throw new ConflictError(`Predicate key ${predicate.key} already exists`);
  }

  addEntity(predicates, predicate, 'Predicate');
}

function addConcept(concepts: Map<ConceptId, Concept>, concept: Concept): void {
  const existing = concepts.get(concept.id);

  if (!existing) {
    concepts.set(concept.id, concept);
    return;
  }

  const keepsIdentity =
    existing.name === concept.name && existing.definition === concept.definition;

  if (!keepsIdentity) {
    throw new ConflictError(`Concept ${concept.id} cannot change its name or definition`);
  }

  const preservesAliases = existing.aliases.every((alias) => concept.aliases.includes(alias));

  if (!preservesAliases) {
    throw new ConflictError(`Concept ${concept.id} cannot remove aliases`);
  }

  concepts.set(concept.id, concept);
}

function requireEntity<Value>(
  entities: ReadonlyMap<string, Value>,
  id: string,
  name: string,
): Value {
  const entity = entities.get(id);

  if (!entity) {
    throw new NotFoundError(`${name} ${id} does not exist`);
  }

  return entity;
}

function findExternalEntry(entries: Iterable<Entry>, entry: Entry): Entry | undefined {
  if (entry.origin.externalId === undefined) {
    return undefined;
  }

  return [...entries].find((candidate) => {
    const hasSameSource = candidate.origin.source === entry.origin.source;
    const hasSameExternalId = candidate.origin.externalId === entry.origin.externalId;

    return hasSameSource && hasSameExternalId;
  });
}

function assertSameContent(existing: Entry, candidate: Entry): void {
  const hasSameKind = existing.content.kind === candidate.content.kind;

  if (!hasSameKind) {
    throw new ConflictError('Entry external identity was reused with different content');
  }

  const existingValue =
    existing.content.kind === 'text' ? existing.content.text : existing.content.url;
  const candidateValue =
    candidate.content.kind === 'text' ? candidate.content.text : candidate.content.url;

  if (existingValue !== candidateValue) {
    throw new ConflictError('Entry external identity was reused with different content');
  }
}

function containsText(content: string, candidate: string): boolean {
  const normalizedContent = ` ${normalizeSearchText(content)} `;
  const normalizedCandidate = normalizeSearchText(candidate);

  return normalizedCandidate.length > 0 && normalizedContent.includes(` ${normalizedCandidate} `);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}
