import { DomainError } from '../../core/error.js';
import type { Capability, CapabilityResult } from '../../core/execution/capability.js';
import type { ComponentValue } from '../../core/item/types.js';
import type { NotificationInput, NotificationPort } from './ports/notification.js';

/** Safe, idempotent Capability wrapper around notification providers. */
export class NotificationCapability implements Capability {
  readonly key = 'notification';
  readonly version = 1;
  readonly description = 'Deliver a user-visible reminder notification';
  readonly defaultAutonomy = 'execute' as const;
  readonly safetyCeiling = 'execute' as const;

  constructor(private readonly notifications: NotificationPort) {}

  validateInput(input: ComponentValue): void {
    if (!isNotificationInput(input)) throw new DomainError('notification input is invalid');
  }

  idempotencyKey(input: ComponentValue): string {
    this.validateInput(input);
    const notification = input as unknown as NotificationInput;
    return `notification:${notification.reminderId}:${notification.occurrenceId}`;
  }

  async execute(
    input: ComponentValue,
    context: { readonly idempotencyKey: string },
  ): Promise<CapabilityResult> {
    this.validateInput(input);
    const result = await this.notifications.deliver(
      input as unknown as NotificationInput,
      context.idempotencyKey,
    );
    if (result.kind === 'delivered')
      return {
        kind: 'success',
        output: { providerId: result.providerId },
        events: [{ key: 'notificationDelivered', data: { providerId: result.providerId } }],
      };
    if (result.kind === 'failed') return { kind: 'failure', message: result.message };
    if (result.kind === 'uncertain') return { kind: 'uncertain', message: result.message };
    return { kind: 'unsupported', message: result.message };
  }
}

function isNotificationInput(value: ComponentValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Readonly<Record<string, ComponentValue>>;
  return ['reminderId', 'occurrenceId', 'subjectItemId', 'message'].every(
    (key) => typeof input[key] === 'string' && Boolean((input[key] as string).trim()),
  );
}
