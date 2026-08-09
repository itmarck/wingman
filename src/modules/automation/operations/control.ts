import { NotFoundError } from '../../../system/error.js';
import type { AutomationStore } from '../ports/store.js';
export class ControlAutomationCommand {
  constructor(private readonly store: AutomationStore) {}
  async execute(id: string, action: 'pause' | 'resume' | 'stop'): Promise<void> {
    const runtime = await this.store.find(id);
    if (!runtime) throw new NotFoundError(`Automation ${id} does not exist`);
    const automation =
      action === 'pause'
        ? runtime.automation.pause()
        : action === 'resume'
          ? runtime.automation.resume()
          : runtime.automation.stop();
    await this.store.save({ ...runtime, automation });
  }
  async reschedule(id: string, occurrences: readonly string[], expiresAt?: string): Promise<void> {
    const runtime = await this.store.find(id);
    if (!runtime) throw new NotFoundError(`Automation ${id} does not exist`);
    const automation = runtime.automation.reschedule([...occurrences].sort(), expiresAt);
    const schedule = automation.when as Extract<
      typeof automation.when,
      { operator: { key: 'schedule' } }
    >;
    await this.store.save({
      automation,
      nextEvaluationAt: schedule.occurrences[0],
      occurrences: 0,
      deduplicationIds: new Set(),
    });
  }
}
