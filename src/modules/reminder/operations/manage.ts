import type { Evidence } from '../../../core/item/types.js';
import type { Condition } from '../../../core/state/condition.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { RegisterAutomationCommand } from '../../automation/operations/register.js';
import type { PlanningCommands } from '../../planning/operations/write.js';
import type { Reminder } from '../domain/reminder.js';
import { validateSchedule } from '../domain/reminder.js';
import type { ReminderStore } from '../ports/store.js';

export interface CreateReminderInput {
  readonly entryId: string;
  readonly subjectItemId?: string;
  readonly subject?: string;
  readonly message: string;
  readonly temporal?: { readonly from?: string; readonly to?: string };
  readonly occurrences: readonly string[];
  readonly expiresAt?: string;
  readonly maxOccurrences?: number;
  readonly authorized?: boolean;
}

export interface ReminderExplanation {
  readonly id: string;
  readonly status: Reminder['status'];
  readonly subjectItemId: string;
  readonly message: string;
  readonly sourceEntryId: string;
  readonly temporal?: Reminder['temporal'];
  readonly occurrences: readonly string[];
  readonly nextOccurrence?: string;
  readonly expiresAt?: string;
  readonly stoppingCondition: Condition;
  readonly cancellation: string;
}

interface AutomationRegistration {
  execute(input: Parameters<RegisterAutomationCommand['execute']>[0]): Promise<string>;
}
interface AutomationControl {
  execute(id: string, action: 'pause' | 'resume' | 'stop'): Promise<void>;
}

/** Composes an explicit Entry into a planning subject and one independent Automation per occurrence. */
export class ReminderService {
  constructor(
    private readonly store: ReminderStore,
    private readonly planning: PlanningCommands,
    private readonly automations: AutomationRegistration,
    private readonly control: AutomationControl,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateReminderInput): Promise<string> {
    validateInput(input);
    const evidence: readonly Evidence[] = [{ entryId: input.entryId, sourceLocators: [] }];
    const subjectItemId =
      input.subjectItemId ??
      (await this.planning.create({
        profile: 'task',
        title: input.subject ?? input.message,
        startAt: input.temporal?.from,
        dueAt: input.temporal?.to,
        evidence,
      }));
    if (input.subjectItemId && input.temporal)
      await this.planning.schedule(
        subjectItemId,
        { startAt: input.temporal.from, dueAt: input.temporal.to },
        evidence,
      );
    const reminderId = this.ids.generate();
    const stopWhen = completionCondition(subjectItemId);
    const occurrences = [...input.occurrences].sort();
    const limited = input.maxOccurrences ? occurrences.slice(0, input.maxOccurrences) : occurrences;
    const automationIds: string[] = [];
    for (const occurrence of limited)
      automationIds.push(
        await this.automations.execute({
          given: [not(stopWhen)],
          when: { operator: { key: 'time', version: 1 }, at: occurrence },
          thenIntents: [
            {
              capability: { key: 'notification', version: 1 },
              input: {
                reminderId,
                occurrenceId: occurrence,
                subjectItemId,
                message: input.message,
              },
              conditions: [not(stopWhen)],
              expectedState: [],
              authorization: input.authorized === false ? 'explicit' : 'none',
              trigger: { kind: 'time', value: occurrence },
            },
          ],
          controls: {
            expiresAt: input.expiresAt,
            maxOccurrences: 1,
            stopWhen,
            deduplication: 'occurrence',
          },
          evidence,
        }),
      );
    const reminder: Reminder = Object.freeze({
      id: reminderId,
      entryId: input.entryId,
      subjectItemId,
      message: input.message,
      temporal: input.temporal ? Object.freeze({ ...input.temporal }) : undefined,
      schedule: Object.freeze({
        occurrences: Object.freeze(limited),
        expiresAt: input.expiresAt,
        stopWhen,
      }),
      automationIds: Object.freeze(automationIds),
      status: 'active',
      createdAt: this.clock.now().toISOString(),
    });
    await this.store.save(reminder);
    return reminder.id;
  }

  async list(): Promise<readonly ReminderExplanation[]> {
    return Object.freeze(
      (await this.store.list()).map((reminder) => explain(reminder, this.clock.now())),
    );
  }
  async read(id: string): Promise<ReminderExplanation> {
    return explain(await this.require(id), this.clock.now());
  }
  async cancel(id: string): Promise<void> {
    const reminder = await this.require(id);
    for (const automationId of reminder.automationIds)
      await this.control.execute(automationId, 'stop');
    await this.store.save(Object.freeze({ ...reminder, status: 'cancelled' }));
  }
  async reschedule(
    id: string,
    schedule: {
      readonly occurrences: readonly string[];
      readonly expiresAt?: string;
    },
  ): Promise<void> {
    const reminder = await this.require(id);
    await this.cancel(id);
    validateSchedule({ ...schedule });
    const evidence: readonly Evidence[] = [{ entryId: reminder.entryId, sourceLocators: [] }];
    const automationIds: string[] = [];
    for (const occurrence of [...schedule.occurrences].sort())
      automationIds.push(
        await this.automations.execute({
          given: [not(reminder.schedule.stopWhen)],
          when: { operator: { key: 'time', version: 1 }, at: occurrence },
          thenIntents: [
            {
              capability: { key: 'notification', version: 1 },
              input: {
                reminderId: id,
                occurrenceId: occurrence,
                subjectItemId: reminder.subjectItemId,
                message: reminder.message,
              },
              conditions: [not(reminder.schedule.stopWhen)],
              expectedState: [],
              authorization: 'none',
              trigger: { kind: 'time', value: occurrence },
            },
          ],
          controls: {
            expiresAt: schedule.expiresAt,
            maxOccurrences: 1,
            stopWhen: reminder.schedule.stopWhen,
            deduplication: 'occurrence',
          },
          evidence,
        }),
      );
    await this.store.save(
      Object.freeze({
        ...reminder,
        status: 'active',
        automationIds: Object.freeze(automationIds),
        schedule: Object.freeze({
          ...schedule,
          occurrences: Object.freeze([...schedule.occurrences].sort()),
          stopWhen: reminder.schedule.stopWhen,
        }),
      }),
    );
  }
  private async require(id: string): Promise<Reminder> {
    const reminder = await this.store.find(id);
    if (!reminder) throw new NotFoundError(`Reminder ${id} does not exist`);
    return reminder;
  }
}

function validateInput(input: CreateReminderInput): void {
  validateSchedule({
    occurrences: input.occurrences,
    expiresAt: input.expiresAt,
  });
  if (!input.subjectItemId && !input.subject?.trim())
    throw new Error('Reminder requires a subject or subject Item');
  if (!input.message.trim()) throw new Error('Reminder message is required');
  if (
    input.maxOccurrences !== undefined &&
    (!Number.isSafeInteger(input.maxOccurrences) || input.maxOccurrences < 1)
  )
    throw new Error('Reminder maxOccurrences is invalid');
  for (const value of [input.temporal?.from, input.temporal?.to])
    if (value && Number.isNaN(Date.parse(value)))
      throw new Error('Reminder temporal constraint is invalid');
}
function completionCondition(itemId: string): Condition {
  return {
    operator: { key: 'equal', version: 1 },
    operands: [
      { kind: 'component', itemId, key: 'lifecycle', field: 'status' },
      { kind: 'literal', value: 'completed' },
    ],
  };
}
function not(condition: Condition): Condition {
  return { operator: { key: 'not', version: 1 }, operands: [condition] };
}
function explain(reminder: Reminder, now: Date): ReminderExplanation {
  return Object.freeze({
    id: reminder.id,
    status: reminder.status,
    subjectItemId: reminder.subjectItemId,
    message: reminder.message,
    sourceEntryId: reminder.entryId,
    temporal: reminder.temporal,
    occurrences: reminder.schedule.occurrences,
    nextOccurrence: reminder.schedule.occurrences.find(
      (occurrence) => Date.parse(occurrence) >= now.getTime(),
    ),
    expiresAt: reminder.schedule.expiresAt,
    stoppingCondition: reminder.schedule.stopWhen,
    cancellation: `Cancel reminder ${reminder.id}`,
  });
}
