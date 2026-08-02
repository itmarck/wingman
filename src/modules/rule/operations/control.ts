import { NotFoundError } from '../../../system/error.js';
import type { RuleStore } from '../ports/store.js';
export class ControlRuleCommand {
  constructor(private readonly store: RuleStore) {}
  async execute(id: string, action: 'pause' | 'resume' | 'stop'): Promise<void> {
    const runtime = await this.store.find(id);
    if (!runtime) throw new NotFoundError(`Rule ${id} does not exist`);
    const rule =
      action === 'pause'
        ? runtime.rule.pause()
        : action === 'resume'
          ? runtime.rule.resume()
          : runtime.rule.stop();
    await this.store.save({ ...runtime, rule });
  }
}
