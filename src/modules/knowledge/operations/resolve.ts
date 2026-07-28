import { type ConceptResolution, resolveConcept } from '../../../core/knowledge/resolve.js';
import type { ConceptStore } from '../ports/store.js';

export interface ResolveConceptInput {
  readonly name: string;
  readonly definition?: string;
}

/**
 * Resolves deterministic candidates available to the application.
 */
export class ResolveConceptQuery {
  constructor(private readonly store: ConceptStore) {}

  async execute(input: ResolveConceptInput): Promise<ConceptResolution> {
    return resolveConcept(await this.store.findConcepts(input.name), input.name, input.definition);
  }
}
