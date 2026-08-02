import type { PlanningProfile } from '../../../core/planning/lifecycle.js';

export interface WorkflowTemporalConstraint {
  readonly from?: string;
  readonly to?: string;
  readonly precision: 'exact' | 'day' | 'month' | 'range' | 'unspecified';
}

interface WorkflowDraftBase {
  readonly reference: string;
  readonly version: 1;
  readonly unresolved: readonly string[];
}

export interface PlanningWorkflowDraft extends WorkflowDraftBase {
  readonly kind: 'planningRequest';
  readonly profile: PlanningProfile;
  readonly title: string;
  readonly notes?: string;
  readonly temporal?: WorkflowTemporalConstraint;
  readonly recurrence?: string;
}

export type ReminderScheduleDraft =
  | { readonly kind: 'occurrences'; readonly at: readonly string[] }
  | { readonly kind: 'deadlineOffsets'; readonly offsetsBeforeMs: readonly number[] }
  | { readonly kind: 'event'; readonly eventKey: string };

export interface ReminderWorkflowDraft extends WorkflowDraftBase {
  readonly kind: 'reminderRequest';
  readonly subjectReference: string;
  readonly message: string;
  readonly temporal?: WorkflowTemporalConstraint;
  readonly schedule: ReminderScheduleDraft;
}

export type InterpretationWorkflowDraft = PlanningWorkflowDraft | ReminderWorkflowDraft;
