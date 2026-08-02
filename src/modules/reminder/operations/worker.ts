import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock } from '../../../system/runtime.js';
import type { ExecuteIntentCommand } from '../../execution/operations/execute.js';
import type { ExecutionStore } from '../../execution/ports/store.js';
import type { RuleWorker } from '../../rule/operations/worker.js';
import type { RuleStore } from '../../rule/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';
import type { ReminderStore } from '../ports/store.js';

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Applies quiet hours, produces due Intents, executes them and records delivered State. */
export class ReminderWorker {
  constructor(
    private readonly reminders: ReminderStore,
    private readonly rules: RuleStore,
    private readonly ruleWorker: Pick<RuleWorker, 'runDue'>,
    private readonly executions: ExecutionStore,
    private readonly executeIntent: Pick<ExecuteIntentCommand, 'execute'>,
    private readonly states: StateWriter,
    private readonly clock: Clock,
  ) {}

  async runDue(): Promise<number> {
    const now = this.clock.now();
    await this.postponeQuietRules(now);
    const before = new Set((await this.executions.listIntents()).map((intent) => intent.id));
    await this.ruleWorker.runDue();
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

  private async postponeQuietRules(now: Date): Promise<void> {
    for (const reminder of await this.reminders.list()) {
      if (
        reminder.status !== 'active' ||
        !reminder.schedule.quietHours ||
        !isQuiet(now, reminder.schedule.quietHours)
      )
        continue;
      const next = quietEnd(now, reminder.schedule.quietHours).toISOString();
      for (const ruleId of reminder.ruleIds) {
        const runtime = await this.rules.find(ruleId);
        if (runtime?.nextEvaluationAt && runtime.nextEvaluationAt <= now.toISOString())
          await this.rules.save({ ...runtime, nextEvaluationAt: next });
      }
    }
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
      const runtimes = await Promise.all(reminder.ruleIds.map((id) => this.rules.find(id)));
      const results = (
        await Promise.all(reminder.ruleIds.map((id) => this.rules.listResults(id)))
      ).flat();
      const intentIds = results.flatMap((result) => result.intentIds);
      const intents = await Promise.all(intentIds.map((id) => this.executions.findIntent(id)));
      const settled =
        intentIds.length === 0 || intents.every((intent) => intent?.status === 'completed');
      if (settled && runtimes.every((runtime) => runtime?.rule.status === 'stopped'))
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
function isQuiet(
  date: Date,
  quiet: { readonly startHour: number; readonly endHour: number },
): boolean {
  const hour = date.getUTCHours();
  return quiet.startHour < quiet.endHour
    ? hour >= quiet.startHour && hour < quiet.endHour
    : hour >= quiet.startHour || hour < quiet.endHour;
}
function quietEnd(
  date: Date,
  quiet: { readonly startHour: number; readonly endHour: number },
): Date {
  const end = new Date(date);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(quiet.endHour);
  if (end <= date) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}
