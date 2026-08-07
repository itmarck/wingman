import type { ControlAutomationCommand } from './operations/control.js';
import type { RegisterAutomationCommand } from './operations/register.js';
import type { AutomationWorker } from './operations/worker.js';
import type { AutomationStore } from './ports/store.js';
export interface AutomationModule {
  readonly registerAutomation: RegisterAutomationCommand;
  readonly controlAutomation: ControlAutomationCommand;
  readonly worker: AutomationWorker;
  readonly store: AutomationStore;
}
