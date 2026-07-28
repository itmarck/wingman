import type { Axiom } from './axiom.js';
import type { Concept } from './concept.js';
import type { Entry } from './entry.js';
import type { Link } from './link.js';
import type { Predicate } from './predicate.js';

/** Immutable view consumed by domain derivations and Projections. */
export interface KnowledgeSnapshot {
  readonly entries: readonly Entry[];
  readonly concepts: readonly Concept[];
  readonly predicates: readonly Predicate[];
  readonly axioms: readonly Axiom[];
  readonly links: readonly Link[];
}
