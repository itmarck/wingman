import { DomainError } from '../../core/error.js';
import type { Capability, CapabilityResult } from '../../core/execution/capability.js';
import type { ComponentValue } from '../../core/item/types.js';

export interface NotificationInput {
  readonly automationId: string;
  readonly occurrenceId: string;
  readonly subjectItemId: string;
  readonly message: string;
  readonly priority?: number;
}

/** Makes a passive notification available to the internal launcher. */
export class NotificationCapability implements Capability {
  readonly key = 'notification';
  readonly version = 1;
  readonly description = 'Make a passive notification available to the launcher';
  readonly defaultAutonomy = 'execute' as const;
  readonly safetyCeiling = 'execute' as const;

  validateInput(input: ComponentValue): void {
    if (!isNotificationInput(input)) throw new DomainError('notification input is invalid');
  }

  idempotencyKey(input: ComponentValue): string {
    this.validateInput(input);
    const notification = input as unknown as NotificationInput;
    return `notification:${notification.automationId}:${notification.occurrenceId}`;
  }

  async execute(input: ComponentValue): Promise<CapabilityResult> {
    this.validateInput(input);
    return {
      kind: 'success',
      output: { channel: 'launcher' },
      events: [{ key: 'notificationDelivered', data: { channel: 'launcher' } }],
    };
  }
}

export function isNotificationInput(value: ComponentValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Readonly<Record<string, ComponentValue>>;
  const validStrings = ['automationId', 'occurrenceId', 'subjectItemId', 'message'].every(
    (key) => typeof input[key] === 'string' && Boolean((input[key] as string).trim()),
  );
  return (
    validStrings &&
    (input.priority === undefined ||
      (typeof input.priority === 'number' && Number.isSafeInteger(input.priority)))
  );
}
