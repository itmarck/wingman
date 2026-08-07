import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { AutomationWorker } from '../../automation/operations/worker.js';
import type { AutomationStore } from '../../automation/ports/store.js';
import type { ExecuteIntentCommand } from '../../execution/operations/execute.js';
import type { ExecutionStore } from '../../execution/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';
import type { ReminderStore } from '../ports/store.js';

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Produces due Intents, executes them and records passive launcher availability. */
export class ReminderWorker {
  constructor(
    private readonly reminders: ReminderStore,
    private readonly automations: AutomationStore,
    private readonly automationWorker: Pick<AutomationWorker, 'runDue'>,
    private readonly executions: ExecutionStore,
    private readonly executeIntent: Pick<ExecuteIntentCommand, 'execute'>,
    private readonly states: StateWriter,
  ) {}

  async runDue(): Promise<number> {
    const before = new Set((await this.executions.listIntents()).map((intent) => intent.id));
    await this.automationWorker.runDue();
    const intents = (await this.executions.listIntents()).filter(
      (intent) => !before.has(intent.id) && isNotificationInput(intent.input),
    );
    for (const intent of intents) await this.execute(intent.id);
    await this.completeFinishedReminders();
    return intents.length;
  }

  async execute(intentId: string): Promise<Awaited<ReturnType<ExecuteIntentCommand['execute']>>> {
    const intent = await this.executions.findIntent(intentId);
    if (!intent) throw new NotFoundError(`Intent ${intentId} does not exist`);
    const outcome = await this.executeIntent.execute(intent.id);
    if (outcome === 'succeeded' && isNotificationInput(intent.input))
      await this.recordDelivered(
        intent.input as Readonly<Record<string, ComponentValue>>,
        intent.evidence,
      );
    await this.completeFinishedReminders();
    return outcome;
  }

  private async recordDelivered(
    input: Readonly<Record<string, ComponentValue>>,
    evidence: PersistStateInput['evidence'],
  ): Promise<void> {
    const occurrence = String(input.occurrenceId);
    await this.states.execute({
      modality: 'observed',
      condition: {
        operator: { key: 'equal', version: 1 },
        operands: [
          { kind: 'literal', value: `delivered:${input.reminderId}:${occurrence}` },
          { kind: 'literal', value: `delivered:${input.reminderId}:${occurrence}` },
        ],
      },
      author: { kind: 'system' },
      evidence,
    });
  }
  private async completeFinishedReminders(): Promise<void> {
    for (const reminder of await this.reminders.list()) {
      if (reminder.status !== 'active') continue;
      const runtimes = await Promise.all(
        reminder.automationIds.map((id) => this.automations.find(id)),
      );
      const results = (
        await Promise.all(reminder.automationIds.map((id) => this.automations.listResults(id)))
      ).flat();
      const intentIds = results.flatMap((result) => result.intentIds);
      const intents = await Promise.all(intentIds.map((id) => this.executions.findIntent(id)));
      const settled =
        intentIds.length === 0 || intents.every((intent) => intent?.status === 'completed');
      if (settled && runtimes.every((runtime) => runtime?.automation.status === 'stopped'))
        await this.reminders.save(Object.freeze({ ...reminder, status: 'completed' }));
    }
  }
}

function isNotificationInput(value: ComponentValue): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Readonly<Record<string, ComponentValue>>).reminderId === 'string',
  );
}
