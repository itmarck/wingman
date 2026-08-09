import type { ReminderService } from './operations/manage.js';
import type { NotificationWorker } from './operations/notification-worker.js';

export interface ReminderModule {
  readonly manage: ReminderService;
  readonly worker: NotificationWorker;
}
