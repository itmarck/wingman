import type { NotificationService } from './operations/service.js';
import type { NotificationWorker } from './operations/worker.js';

export interface NotificationModule {
  readonly service: NotificationService;
  readonly worker: NotificationWorker;
}
