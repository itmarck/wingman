import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { AutomationWorker } from '../../automation/operations/worker.js';
import type { ExecuteIntentCommand } from '../../execution/operations/execute.js';
import type { ExecutionStore } from '../../execution/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Produces due Intents, executes them and records passive launcher availability. */
export class NotificationWorker {
  constructor(
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
}

function isNotificationInput(value: ComponentValue): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Readonly<Record<string, ComponentValue>>).reminderId === 'string',
  );
}
