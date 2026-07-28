import { NotFoundError } from '../../../system/error.js';
import type { Interpretation } from '../domain/interpretation.js';
import type { InterpretationStateStore } from '../ports/state.js';

/**
 * Retrieves the latest historical Interpretation for one Entry.
 */
export class GetInterpretationQuery {
  constructor(private readonly store: InterpretationStateStore) {}

  async execute(entryId: string): Promise<Interpretation> {
    const interpretation = await this.store.findLatestInterpretation(entryId);

    if (!interpretation) {
      throw new NotFoundError(`Entry ${entryId} has no Interpretation`);
    }

    return interpretation;
  }
}
