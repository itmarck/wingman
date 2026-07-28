import { Concept, type ConceptMetadata } from '../../../core/knowledge/concept.js';
import type { IdGenerator } from '../../../system/runtime.js';
import type { ConceptStore } from '../ports/store.js';

/**
 * Registers a stable Concept identity.
 */
export class RegisterConceptCommand {
  constructor(
    private readonly store: ConceptStore,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: ConceptMetadata): Promise<Concept> {
    const concept = Concept.create({
      ...input,
      id: this.ids.generate(),
    });

    await this.store.saveConcept(concept);

    return concept;
  }
}
