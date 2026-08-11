import type { Intent } from '../../../core/execution/intent.js';
import type { ExecutionStore } from '../ports/store.js';
import type { ExecuteIntentCommand } from './execute.js';

/** Executes every newly eligible Intent without Capability-specific branching. */
export class ExecutionWorker {
  constructor(
    private readonly store: ExecutionStore,
    private readonly executeIntent: Pick<ExecuteIntentCommand, 'execute'>,
  ) {}

  async runPending(): Promise<number> {
    const terminal = new Set(
      (await this.store.listEvents())
        .filter(({ key }) =>
          ['capabilityUnsupported', 'intentStale', 'autonomyRestricted'].includes(key),
        )
        .flatMap(({ causation }) => (causation.intentId ? [causation.intentId] : [])),
    );
    const intents = await this.store.listIntents();
    const eligible: Intent[] = [];
    for (const intent of intents) {
      if (terminal.has(intent.id)) continue;
      const authorized =
        (intent.status === 'proposed' && intent.consent === 'none') ||
        intent.status === 'consented';
      const attempts = await this.store.listAttempts(intent.id);
      const interrupted = attempts.some(({ outcome }) => outcome === 'started');
      if (!authorized || (attempts.length > 0 && !interrupted)) continue;
      eligible.push(intent);
    }
    for (const intent of eligible) await this.executeIntent.execute(intent.id);
    return eligible.length;
  }
}
