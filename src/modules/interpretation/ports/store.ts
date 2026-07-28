import type { Axiom } from '../../../core/knowledge/axiom.js';
import type { Concept } from '../../../core/knowledge/concept.js';
import type { Link } from '../../../core/knowledge/link.js';
import type { Predicate } from '../../../core/knowledge/predicate.js';
import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';

export interface InterpretationRegistration {
  readonly concepts: readonly Concept[];
  readonly predicates: readonly Predicate[];
  readonly axioms: readonly Axiom[];
  readonly links: readonly Link[];
}

export interface InterpretationPublication {
  readonly conceptIds: readonly string[];
  readonly predicateIds: readonly string[];
  readonly axiomIds: readonly string[];
  readonly linkIds: readonly string[];
}

export interface InterpretationStore {
  loadKnowledge(): Promise<KnowledgeSnapshot>;

  /**
   * Persists one interpretation atomically.
   */
  saveInterpretation(registration: InterpretationRegistration): Promise<void>;
}
