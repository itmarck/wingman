import type { Reminder } from '../domain/reminder.js';

export interface ReminderStore {
  save(reminder: Reminder): Promise<void>;
  find(id: string): Promise<Reminder | undefined>;
  list(): Promise<readonly Reminder[]>;
}
