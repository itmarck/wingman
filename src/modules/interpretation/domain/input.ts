import type { Literal, SourceLocator } from '../../../core/knowledge/axiom.js';
import type { ConceptId } from '../../../core/knowledge/concept.js';
import type {
  PredicateMode,
  PredicateOrigin,
  PredicateScope,
} from '../../../core/knowledge/predicate.js';

export interface InterpretationConcept {
  readonly reference: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly definition: string;
  readonly referenceStatus?: 'identified' | 'uncertain';
}

export interface InterpretationPredicate {
  readonly key: string;
  readonly definition: string;
  readonly origin: PredicateOrigin;
  readonly scope: PredicateScope;
  readonly mode?: PredicateMode;
}

export type InterpretationObject =
  | { readonly kind: 'concept'; readonly conceptReference: string }
  | { readonly kind: 'literal'; readonly literal: Literal };

export interface InterpretationAxiom {
  readonly reference: string;
  readonly subjectReference: string;
  readonly predicateKey: string;
  readonly object: InterpretationObject;
  readonly sourceLocators?: readonly SourceLocator[];
}

export interface InterpretationLink {
  readonly sourceReference: string;
  readonly predicateKey: string;
  readonly targetReference: string;
  readonly sourceLocators?: readonly SourceLocator[];
}

export interface ReferenceResolutionRequest {
  readonly reference: string;
  readonly question: string;
  readonly candidateConceptIds: readonly ConceptId[];
}

export interface ReferenceDecision {
  readonly reference: string;
  readonly selectedConceptId?: ConceptId;
}

export interface RegisterInterpretationInput {
  readonly entryId: string;
  readonly concepts: readonly InterpretationConcept[];
  readonly predicates: readonly InterpretationPredicate[];
  readonly axioms: readonly InterpretationAxiom[];
  readonly links?: readonly InterpretationLink[];
  readonly referenceResolutions?: readonly ReferenceResolutionRequest[];
  readonly referenceDecisions?: readonly ReferenceDecision[];
}
