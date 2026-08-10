import { NotFoundError } from '../../../system/error.js';
import type { ExecutionStore } from '../ports/store.js';

/** Records explicit human consent for an Intent that requires it. */
export class GrantIntentConsentCommand {
  constructor(private readonly store: ExecutionStore) {}

  async execute(intentId: string): Promise<void> {
    const intent = await this.store.findIntent(intentId);
    if (!intent) throw new NotFoundError(`Intent ${intentId} does not exist`);
    if (intent.consent === 'none') return;
    await this.store.saveIntent(intent.grantConsent());
  }
}
