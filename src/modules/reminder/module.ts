import type { ReminderService } from './operations/manage.js';
import type { ReminderWorker } from './operations/worker.js';

export interface ReminderModule {
  readonly manage: ReminderService;
  readonly worker: ReminderWorker;
}
