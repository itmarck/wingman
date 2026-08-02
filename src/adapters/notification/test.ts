import type {
  NotificationInput,
  NotificationPort,
  NotificationResult,
} from '../../modules/reminder/ports/notification.js';

export type TestNotificationMode = 'delivered' | 'failed' | 'uncertain' | 'unavailable';

/** Deterministic adapter for delivery, failure, uncertainty and duplicate-safety tests. */
export class TestNotificationAdapter implements NotificationPort {
  readonly deliveries: NotificationInput[] = [];
  readonly #delivered = new Map<string, string>();
  constructor(readonly mode: TestNotificationMode = 'delivered') {}
  async deliver(input: NotificationInput, idempotencyKey: string): Promise<NotificationResult> {
    const existing = this.#delivered.get(idempotencyKey);
    if (existing) return { kind: 'delivered', providerId: existing };
    if (this.mode === 'failed') return { kind: 'failed', message: 'Provider rejected delivery' };
    if (this.mode === 'unavailable')
      return { kind: 'unavailable', message: 'Provider unavailable' };
    const providerId = `test-${this.#delivered.size + 1}`;
    this.deliveries.push(Object.freeze({ ...input }));
    this.#delivered.set(idempotencyKey, providerId);
    if (this.mode === 'uncertain')
      return { kind: 'uncertain', message: 'Provider response was lost' };
    return { kind: 'delivered', providerId };
  }
}
