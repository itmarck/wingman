import type { Interpretation } from '../domain/interpretation.js';
import type { InterpretationStateStore } from '../ports/state.js';

/**
 * Retrieves the complete Interpretation history for one Entry.
 */
export class ListInterpretationsQuery {
  constructor(private readonly store: InterpretationStateStore) {}

  async execute(entryId: string): Promise<readonly Interpretation[]> {
    return this.store.listInterpretations(entryId);
  }
}
