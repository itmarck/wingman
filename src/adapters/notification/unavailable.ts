import type { NotificationPort } from '../../modules/reminder/ports/notification.js';

/** Explicit placeholder used until a production provider is configured. */
export class UnavailableNotificationAdapter implements NotificationPort {
  async deliver() {
    return { kind: 'unavailable' as const, message: 'Notification provider is unavailable' };
  }
}
