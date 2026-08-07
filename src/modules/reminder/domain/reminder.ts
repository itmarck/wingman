import { DomainError } from '../../../core/error.js';
import type { Condition } from '../../../core/state/condition.js';

export interface ReminderSchedule {
  readonly occurrences: readonly string[];
  readonly expiresAt?: string;
  readonly stopWhen: Condition;
}
export interface Reminder {
  readonly id: string;
  readonly entryId: string;
  readonly subjectItemId: string;
  readonly message: string;
  readonly temporal?: { readonly from?: string; readonly to?: string };
  readonly schedule: ReminderSchedule;
  readonly automationIds: readonly string[];
  readonly status: 'active' | 'cancelled' | 'completed';
  readonly createdAt: string;
}

export function validateSchedule(schedule: Omit<ReminderSchedule, 'stopWhen'>): void {
  if (schedule.occurrences.length === 0)
    throw new DomainError('Reminder requires an explicit occurrence schedule');
  for (const occurrence of schedule.occurrences)
    if (Number.isNaN(Date.parse(occurrence)))
      throw new DomainError('Reminder occurrence must be a valid date-time');
  if (new Set(schedule.occurrences).size !== schedule.occurrences.length)
    throw new DomainError('Reminder occurrences must be unique');
  if (schedule.expiresAt && Number.isNaN(Date.parse(schedule.expiresAt)))
    throw new DomainError('Reminder expiration must be a valid date-time');
}
