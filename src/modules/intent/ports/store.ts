import type { Intent } from '../domain/intent.js';

export interface IntentStore {
  saveIntent(intent: Intent): Promise<void>;
}
