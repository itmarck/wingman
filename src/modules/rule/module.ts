import type { ControlRuleCommand } from './operations/control.js';
import type { RegisterRuleCommand } from './operations/register.js';
import type { RuleWorker } from './operations/worker.js';
import type { RuleStore } from './ports/store.js';
export interface RuleModule {
  readonly registerRule: RegisterRuleCommand;
  readonly controlRule: ControlRuleCommand;
  readonly worker: RuleWorker;
  readonly store: RuleStore;
}
