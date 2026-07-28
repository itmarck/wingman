import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import type { Projection, ProjectionResult } from './projection.js';

export interface GlossaryConcept {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly definition: string;
}

export interface GlossaryResult extends ProjectionResult {
  readonly concepts: readonly GlossaryConcept[];
}

export class GlossaryProjection implements Projection {
  readonly metadata = Object.freeze({
    key: 'system.glossary',
    name: 'Glossary',
    description: 'Canonical Concepts known by the system',
  });

  build(snapshot: KnowledgeSnapshot): GlossaryResult {
    const concepts = snapshot.concepts
      .map((concept) =>
        Object.freeze({
          id: concept.id,
          name: concept.name,
          aliases: concept.aliases,
          definition: concept.definition,
        }),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    return Object.freeze({
      concepts: Object.freeze(concepts),
    });
  }
}
