import type { Axiom } from '../../../core/knowledge/axiom.js';
import type { Concept } from '../../../core/knowledge/concept.js';
import type { Entry } from '../../../core/knowledge/entry.js';
import type { Predicate } from '../../../core/knowledge/predicate.js';

/**
 * Relevant existing knowledge supplied to an Interpreter without exposing persistence.
 */
export interface InterpretationContext {
  readonly concepts: readonly Concept[];
  readonly predicates: readonly Predicate[];
  readonly axioms: readonly Axiom[];
}

/**
 * Retrieves the bounded knowledge an Interpreter may consider for one Entry.
 */
export interface InterpretationContextSource {
  findInterpretationContext(entry: Entry): Promise<InterpretationContext>;
}
