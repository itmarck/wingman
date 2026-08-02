import type { Reminder } from '../../domain/reminder.js';
import type { ReminderStore } from '../../ports/store.js';

export class MemoryReminderStore implements ReminderStore {
  readonly #reminders = new Map<string, Reminder>();
  async save(reminder: Reminder): Promise<void> {
    this.#reminders.set(reminder.id, Object.freeze(structuredClone(reminder)));
  }
  async find(id: string): Promise<Reminder | undefined> {
    return this.#reminders.get(id);
  }
  async list(): Promise<readonly Reminder[]> {
    return Object.freeze([...this.#reminders.values()]);
  }
}
