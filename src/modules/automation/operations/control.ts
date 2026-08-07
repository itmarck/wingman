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
}
