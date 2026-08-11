import { DomainError } from '../../../core/error.js';
import type { Capability, CapabilityResult } from '../../../core/execution/capability.js';
import type { ComponentValue } from '../../../core/item/types.js';

export interface NotificationInput {
  readonly message: string;
  readonly priority?: number;
}

/** Makes a passive notification available to the internal launcher. */
export class NotificationCapability implements Capability {
  readonly key = 'notification';
  readonly version = 1;
  readonly description =
    'Make a passive notification available to the launcher. Input: { message: string, priority?: integer }. Runtime derives Automation, occurrence and subject identity.';
  readonly defaultAutonomy = 'execute' as const;
  readonly safetyCeiling = 'execute' as const;

  validateInput(input: ComponentValue): void {
    if (!isNotificationInput(input)) throw new DomainError('notification input is invalid');
  }

  idempotencyKey(input: ComponentValue, intentId: string): string {
    this.validateInput(input);
    return `notification:${intentId}`;
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
  return (
    Object.keys(input).every((key) => ['message', 'priority'].includes(key)) &&
    typeof input.message === 'string' &&
    Boolean(input.message.trim()) &&
    (input.priority === undefined ||
      (typeof input.priority === 'number' && Number.isSafeInteger(input.priority)))
  );
}
