import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import type { Projection, ProjectionResult } from './projection.js';

export interface PredicateCatalogItem {
  readonly id: string;
  readonly key: string;
  readonly definition: string;
  readonly origin: string;
  readonly scope: string;
  readonly mode: string;
}

export interface PredicateCatalogResult extends ProjectionResult {
  readonly predicates: readonly PredicateCatalogItem[];
}

/** Lists the Predicates available for interpreting current Axioms and Links. */
export class PredicateCatalogProjection implements Projection {
  readonly metadata = Object.freeze({
    key: 'system.predicates',
    name: 'Predicate Catalog',
    description: 'Predicates available in the current knowledge state',
  });

  build(snapshot: KnowledgeSnapshot): PredicateCatalogResult {
    const predicates = snapshot.predicates
      .map((predicate) =>
        Object.freeze({
          id: predicate.id,
          key: predicate.key,
          definition: predicate.definition,
          origin: predicate.origin,
          scope: predicate.scope,
          mode: predicate.mode,
        }),
      )
      .sort((left, right) => left.key.localeCompare(right.key));

    return Object.freeze({
      predicates: Object.freeze(predicates),
    });
  }
}
