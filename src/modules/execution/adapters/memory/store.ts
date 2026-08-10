import type { Attempt } from '../../../../core/execution/attempt.js';
import type { Event } from '../../../../core/execution/event.js';
import type { Intent } from '../../../../core/execution/intent.js';
import { ConflictError } from '../../../../system/error.js';
import type { ExecutionStore } from '../../ports/store.js';

export class MemoryExecutionStore implements ExecutionStore {
  readonly #intents = new Map<string, Intent>();
  readonly #attempts = new Map<string, Attempt>();
  readonly #events = new Map<string, Event>();
  async saveIntent(intent: Intent): Promise<void> {
    const existing = this.#intents.get(intent.id);
    if (existing && !validTransition(existing.status, intent.status))
      throw new ConflictError(
        `Intent ${intent.id} transition ${existing.status} -> ${intent.status} is invalid`,
      );
    this.#intents.set(intent.id, intent);
  }
  async findIntent(id: string): Promise<Intent | undefined> {
    return this.#intents.get(id);
  }
  async listIntents(): Promise<readonly Intent[]> {
    return Object.freeze([...this.#intents.values()]);
  }
  async appendAttempt(attempt: Attempt): Promise<void> {
    if (this.#attempts.has(attempt.id))
      throw new ConflictError(`Attempt ${attempt.id} already exists`);
    this.#attempts.set(attempt.id, attempt);
  }
  async listAttempts(intentId: string): Promise<readonly Attempt[]> {
    return Object.freeze(
      [...this.#attempts.values()]
        .filter((attempt) => attempt.intentId === intentId)
        .sort((left, right) => left.sequence - right.sequence),
    );
  }
  async appendEvent(event: Event): Promise<void> {
    if (this.#events.has(event.id)) throw new ConflictError(`Event ${event.id} already exists`);
    this.#events.set(event.id, event);
  }
  async listEvents(intentId?: string): Promise<readonly Event[]> {
    return Object.freeze(
      [...this.#events.values()].filter(
        (event) => !intentId || event.causation.intentId === intentId,
      ),
    );
  }
}

function validTransition(from: Intent['status'], to: Intent['status']): boolean {
  return (
    from === to ||
    (from === 'proposed' && ['consented', 'cancelled', 'completed'].includes(to)) ||
    (from === 'consented' && ['cancelled', 'completed'].includes(to))
  );
}
