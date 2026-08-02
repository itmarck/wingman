import type { ComponentValue } from '../../../core/item/types.js';
import type { RegisterInterpretationInput } from '../domain/input.js';
import type { InterpretationWorkflowDraft } from '../domain/workflow.js';

export type WorkflowOutcomeStatus = 'applied' | 'needsInput' | 'unsupported' | 'failed';
export interface WorkflowOutcome {
  readonly entryId: string;
  readonly reference: string;
  readonly kind: InterpretationWorkflowDraft['kind'];
  readonly status: WorkflowOutcomeStatus;
  readonly targetId?: string;
  readonly reason?: string;
  readonly details?: ComponentValue;
  readonly recordedAt: string;
}

export interface WorkflowOutcomeSource {
  list(entryId?: string): Promise<readonly WorkflowOutcome[]>;
}

export interface InterpretationWorkflowRouter {
  execute(input: RegisterInterpretationInput): Promise<void>;
}
