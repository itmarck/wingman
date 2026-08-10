import { NotFoundError } from '../../../system/error.js';
import type { Clock } from '../../../system/runtime.js';
import type { Interpretation } from '../domain/interpretation.js';
import type { InterpretationLifecycle, InterpretationStateStore } from '../ports.js';

/**
 * Requeues an Entry whose Interpretation failed or exhausted automatic retries.
 */
export class RetryEntryCommand {
  constructor(
    private readonly interpretations: InterpretationStateStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly clock: Clock,
  ) {}

  async execute(entryId: string): Promise<void> {
    await this.commit(await this.prepare(entryId));
  }

  async prepare(entryId: string): Promise<Interpretation> {
    const current = await this.interpretations.findLatestInterpretation(entryId);

    if (!current) {
      throw new NotFoundError(`Entry ${entryId} has no Interpretation`);
    }

    return current.retry(this.clock.now().toISOString());
  }

  async commit(interpretation: Interpretation): Promise<void> {
    await this.lifecycle.retry(interpretation);
  }
}
