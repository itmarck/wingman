import type { AutomationWorker } from '../../automation/operations/worker.js';
import type { ExecuteIntentCommand } from '../../execution/operations/execute.js';
import type { ExecutionStore } from '../../execution/ports/store.js';

/** Produces due notification Intents and makes them available to the launcher. */
export class NotificationWorker {
  constructor(
    private readonly automationWorker: Pick<AutomationWorker, 'runDue'>,
    private readonly executions: ExecutionStore,
    private readonly executeIntent: Pick<ExecuteIntentCommand, 'execute'>,
  ) {}

  async runDue(): Promise<number> {
    const before = new Set((await this.executions.listIntents()).map((intent) => intent.id));
    await this.automationWorker.runDue();
    const intents = (await this.executions.listIntents()).filter(
      (intent) =>
        !before.has(intent.id) &&
        intent.capability.key === 'notification' &&
        intent.capability.version === 1,
    );
    for (const intent of intents) await this.executeIntent.execute(intent.id);
    return intents.length;
  }
}
