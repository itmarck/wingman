import type { AxiomObject, SourceLocator } from '../../../core/knowledge/axiom.js';
import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import { deriveCurrentAxioms } from '../../../core/knowledge/vigency.js';
import type { Projection, ProjectionResult } from './projection.js';

export interface CurrentAxiom {
  readonly id: string;
  readonly entryId: string;
  readonly subjectConceptId: string;
  readonly predicateId: string;
  readonly object: AxiomObject;
  readonly sourceLocators: readonly SourceLocator[];
}

export interface CurrentAxiomsResult extends ProjectionResult {
  readonly axioms: readonly CurrentAxiom[];
}

export class CurrentAxiomsProjection implements Projection {
  readonly metadata = Object.freeze({
    key: 'system.currentAxioms',
    name: 'Current Axioms',
    description: 'Axioms that have not been superseded',
  });

  build(snapshot: KnowledgeSnapshot): CurrentAxiomsResult {
    const axioms = deriveCurrentAxioms(snapshot.axioms, snapshot.links, snapshot.predicates).map(
      (axiom) =>
        Object.freeze({
          id: axiom.id,
          entryId: axiom.entryId,
          subjectConceptId: axiom.subjectConceptId,
          predicateId: axiom.predicateId,
          object: axiom.object,
          sourceLocators: axiom.sourceLocators,
        }),
    );

    return Object.freeze({
      axioms: Object.freeze(axioms),
    });
  }
}
