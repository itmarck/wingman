import type { Attempt } from '../../../core/execution/attempt.js';
import type { Event } from '../../../core/execution/event.js';
import type { Intent } from '../../../core/execution/intent.js';

export interface ExecutionStore {
  saveIntent(intent: Intent): Promise<void>;
  findIntent(id: string): Promise<Intent | undefined>;
  listIntents(): Promise<readonly Intent[]>;
  reserveAttempt(attempt: Attempt): Promise<void>;
  finishAttempt(
    attempt: Attempt,
    events: readonly Event[],
    completedIntent?: Intent,
  ): Promise<void>;
  listAttempts(intentId: string): Promise<readonly Attempt[]>;
  appendEvent(event: Event): Promise<void>;
  listEvents(intentId?: string): Promise<readonly Event[]>;
}
