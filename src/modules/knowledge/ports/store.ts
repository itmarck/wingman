import type { Concept } from '../../../core/knowledge/concept.js';

/**
 * Persistence required by Concept operations.
 */
export interface ConceptStore {
  saveConcept(concept: Concept): Promise<void>;
  findConcepts(name: string): Promise<readonly Concept[]>;
}
