import { DomainError } from '../../../core/error.js';
import type { ComponentValue, Evidence, ItemReference } from '../../../core/item/types.js';
import type { Condition } from '../../../core/state/condition.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { RegisterAutomationCommand } from '../../automation/operations/register.js';
import type { AutomationRuntime, AutomationStore } from '../../automation/ports/store.js';
import type { PlanningCommands } from '../../planning/operations/write.js';

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
  readonly status: 'active' | 'paused' | 'cancelled' | 'completed';
  readonly subjectItemId: string;
  readonly message: string;
  readonly sourceEntryId: string;
  readonly temporal?: { readonly from?: string; readonly to?: string };
  readonly occurrences: readonly string[];
  readonly nextOccurrence?: string;
  readonly expiresAt?: string;
  readonly stoppingCondition?: Condition;
  readonly cancellation: string;
}

interface AutomationRegistration {
  execute(input: Parameters<RegisterAutomationCommand['execute']>[0]): Promise<string>;
}
interface AutomationControl {
  execute(id: string, action: 'pause' | 'resume' | 'stop'): Promise<void>;
  reschedule(id: string, occurrences: readonly string[], expiresAt?: string): Promise<void>;
}

/** Compatibility view that represents reminders as notification Automations. */
export class ReminderService {
  constructor(
    private readonly store: AutomationStore,
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
    const id = this.ids.generate();
    const stopWhen = completionCondition(subjectItemId);
    const occurrences = [...input.occurrences].sort().slice(0, input.maxOccurrences);
    await this.automations.execute({
      id,
      subjects: [{ kind: 'itemReference', itemId: subjectItemId } satisfies ItemReference],
      given: [not(stopWhen)],
      when: { operator: { key: 'schedule', version: 1 }, occurrences },
      thenIntents: [
        {
          capability: { key: 'notification', version: 1 },
          input: compact({
            reminderId: id,
            occurrenceId: '$trigger.id',
            subjectItemId,
            message: input.message,
            temporal: input.temporal,
          }) as ComponentValue,
          conditions: [not(stopWhen)],
          expectedState: [],
          authorization: input.authorized === false ? 'explicit' : 'none',
          trigger: { kind: 'time', value: occurrences[0] },
        },
      ],
      controls: {
        expiresAt: input.expiresAt,
        maxOccurrences: occurrences.length,
        stopWhen,
        deduplication: 'trigger',
      },
      evidence,
    });
    return id;
  }

  async list(): Promise<readonly ReminderExplanation[]> {
    const runtimes = (await this.store.list()).filter(isNotificationAutomation);
    return Object.freeze(
      await Promise.all(
        runtimes.map(async (runtime) =>
          explain(runtime, this.clock.now(), await this.store.listResults(runtime.automation.id)),
        ),
      ),
    );
  }
  async read(id: string): Promise<ReminderExplanation> {
    const runtime = await this.require(id);
    return explain(runtime, this.clock.now(), await this.store.listResults(runtime.automation.id));
  }
  async cancel(id: string): Promise<void> {
    await this.require(id);
    await this.control.execute(id, 'stop');
  }
  async reschedule(
    id: string,
    schedule: { readonly occurrences: readonly string[]; readonly expiresAt?: string },
  ): Promise<void> {
    await this.require(id);
    validateSchedule(schedule);
    await this.control.reschedule(id, schedule.occurrences, schedule.expiresAt);
  }
  private async require(id: string): Promise<AutomationRuntime> {
    const runtime = await this.store.find(id);
    if (!runtime || !isNotificationAutomation(runtime))
      throw new NotFoundError(`Reminder ${id} does not exist`);
    return runtime;
  }
}

export function validateSchedule(schedule: {
  readonly occurrences: readonly string[];
  readonly expiresAt?: string;
}): void {
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
function validateInput(input: CreateReminderInput): void {
  validateSchedule(input);
  if (!input.subjectItemId && !input.subject?.trim())
    throw new DomainError('Reminder requires a subject or subject Item');
  if (!input.message.trim()) throw new DomainError('Reminder message is required');
  if (
    input.maxOccurrences !== undefined &&
    (!Number.isSafeInteger(input.maxOccurrences) || input.maxOccurrences < 1)
  )
    throw new DomainError('Reminder maxOccurrences is invalid');
  for (const value of [input.temporal?.from, input.temporal?.to])
    if (value && Number.isNaN(Date.parse(value)))
      throw new DomainError('Reminder temporal constraint is invalid');
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
function isNotificationAutomation(runtime: AutomationRuntime): boolean {
  return (
    runtime.automation.when.operator.key === 'schedule' &&
    runtime.automation.thenIntents.some(
      ({ capability }) => capability.key === 'notification' && capability.version === 1,
    )
  );
}
function explain(
  runtime: AutomationRuntime,
  now: Date,
  results: readonly { readonly outcome: string }[],
): ReminderExplanation {
  const automation = runtime.automation;
  const input = automation.thenIntents[0]?.input as Readonly<Record<string, ComponentValue>>;
  const occurrences =
    automation.when.operator.key === 'schedule'
      ? (automation.when as Extract<typeof automation.when, { operator: { key: 'schedule' } }>)
          .occurrences
      : [];
  const temporal = input.temporal as ReminderExplanation['temporal'];
  const status =
    automation.status === 'stopped'
      ? runtime.occurrences >= occurrences.length || results.length > 0
        ? 'completed'
        : 'cancelled'
      : automation.status;
  return Object.freeze({
    id: automation.id,
    status,
    subjectItemId: String(input.subjectItemId),
    message: String(input.message),
    sourceEntryId: automation.evidence[0]?.entryId ?? '',
    temporal,
    occurrences,
    nextOccurrence: occurrences.find((occurrence) => Date.parse(occurrence) >= now.getTime()),
    expiresAt: automation.controls.expiresAt,
    stoppingCondition: automation.controls.stopWhen,
    cancellation: `Cancel reminder ${automation.id}`,
  });
}
function compact<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map(compact) as Value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, compact(child)]),
    ) as Value;
  return value;
}
