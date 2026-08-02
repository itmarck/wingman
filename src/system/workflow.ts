import type { ComponentValue } from '../core/item/types.js';
import type { WorkflowOutcomeStore } from '../modules/interpretation/adapters/memory/workflow.js';
import type { RegisterInterpretationInput } from '../modules/interpretation/domain/input.js';
import type {
  InterpretationWorkflowDraft,
  PlanningWorkflowDraft,
  ReminderWorkflowDraft,
} from '../modules/interpretation/domain/workflow.js';
import type {
  InterpretationWorkflowRouter,
  WorkflowOutcomeStatus,
} from '../modules/interpretation/ports/workflow.js';
import type { PlanningCommands } from '../modules/planning/operations/write.js';
import type { ReminderService } from '../modules/reminder/operations/manage.js';
import type { Clock } from './runtime.js';

/** Per-process idempotency and explanation registry for interpreted workflows. */
/** Routes validated drafts through existing commands and never invokes an adapter. */
export class EntryWorkflowRouter implements InterpretationWorkflowRouter {
  constructor(
    private readonly outcomes: WorkflowOutcomeStore,
    private readonly planning: Pick<PlanningCommands, 'create'>,
    private readonly reminders: Pick<ReminderService, 'create'>,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterInterpretationInput): Promise<void> {
    const workflows = input.workflows ?? [];
    const planning = workflows.filter(
      (workflow): workflow is PlanningWorkflowDraft => workflow.kind === 'planningRequest',
    );
    for (const workflow of planning) await this.applyPlanning(input.entryId, workflow);
    for (const workflow of workflows)
      if (workflow.kind === 'reminderRequest')
        await this.applyReminder(input.entryId, workflow, planning);
  }

  private async applyPlanning(entryId: string, draft: PlanningWorkflowDraft): Promise<void> {
    if (await this.outcomes.find(entryId, draft.reference)) return;
    try {
      const targetId = await this.planning.create({
        profile: draft.profile,
        title: draft.title,
        notes: draft.notes,
        startAt: draft.temporal?.from,
        dueAt: draft.temporal?.to,
        recurrence: draft.recurrence,
        unresolved: draft.unresolved,
        evidence: [{ entryId, sourceLocators: [] }],
      });
      await this.record(entryId, draft, 'applied', { targetId });
    } catch (error) {
      await this.record(entryId, draft, 'failed', { reason: message(error) });
    }
  }

  private async applyReminder(
    entryId: string,
    draft: ReminderWorkflowDraft,
    planning: readonly PlanningWorkflowDraft[],
  ): Promise<void> {
    if (await this.outcomes.find(entryId, draft.reference)) return;
    const subjectDraft = planning.find((workflow) => workflow.reference === draft.subjectReference);
    const subject = await this.outcomes.find(entryId, draft.subjectReference);
    if (!subjectDraft || subject?.status !== 'applied' || !subject.targetId) {
      await this.record(entryId, draft, 'failed', { reason: 'Reminder subject was not applied' });
      return;
    }
    const unresolved = [...subjectDraft.unresolved, ...draft.unresolved];
    if (unresolved.length > 0) {
      await this.record(entryId, draft, 'needsInput', {
        reason: 'Reminder requires unresolved source values',
        details: { unresolved },
      });
      return;
    }
    if (draft.schedule.kind === 'event') {
      await this.record(entryId, draft, 'unsupported', {
        reason: `Event source ${draft.schedule.eventKey} is not registered`,
      });
      return;
    }
    const occurrences =
      draft.schedule.kind === 'occurrences'
        ? draft.schedule.at
        : draft.schedule.offsetsBeforeMs.map((offset) =>
            new Date(Date.parse(draft.temporal?.to ?? '') - offset).toISOString(),
          );
    try {
      const targetId = await this.reminders.create({
        entryId,
        subjectItemId: subject.targetId,
        message: draft.message,
        temporal: draft.temporal ? { from: draft.temporal.from, to: draft.temporal.to } : undefined,
        occurrences: [...new Set(occurrences)].sort(),
        authorized: true,
      });
      await this.record(entryId, draft, 'applied', { targetId });
    } catch (error) {
      await this.record(entryId, draft, 'failed', { reason: message(error) });
    }
  }

  private async record(
    entryId: string,
    draft: InterpretationWorkflowDraft,
    status: WorkflowOutcomeStatus,
    result: {
      readonly targetId?: string;
      readonly reason?: string;
      readonly details?: ComponentValue;
    },
  ): Promise<void> {
    await this.outcomes.save({
      entryId,
      reference: draft.reference,
      kind: draft.kind,
      status,
      ...result,
      recordedAt: this.clock.now().toISOString(),
    });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
