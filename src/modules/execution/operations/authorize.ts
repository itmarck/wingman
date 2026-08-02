import { NotFoundError } from '../../../system/error.js';
import type { ExecutionStore } from '../ports/store.js';

export class AuthorizeIntentCommand {
  constructor(private readonly store: ExecutionStore) {}
  async execute(intentId: string): Promise<void> {
    const intent = await this.store.findIntent(intentId);
    if (!intent) throw new NotFoundError(`Intent ${intentId} does not exist`);
    await this.store.saveIntent(intent.authorize());
  }
}
