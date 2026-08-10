import { Event } from '../../../core/execution/event.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
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

/** Cancels one eligible Intent and records the lifecycle event. */
export class CancelIntentCommand {
  constructor(
    private readonly store: ExecutionStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(intentId: string): Promise<void> {
    const intent = await this.store.findIntent(intentId);
    if (!intent) throw new NotFoundError(`Intent ${intentId} does not exist`);
    await this.store.saveIntent(intent.cancel());
    await this.store.appendEvent(
      Event.create({
        id: this.ids.generate(),
        key: 'intentCancelled',
        occurredAt: this.clock.now().toISOString(),
        causation: { intentId },
        data: { status: 'cancelled' },
      }),
    );
  }
}
