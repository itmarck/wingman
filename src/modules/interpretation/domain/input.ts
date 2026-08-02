import type {
  CandidateStatus,
  ComponentValue,
  ProfileReference,
  ValidTime,
} from '../../../core/item/types.js';
import type { SourceLocator } from '../../../core/knowledge/source.js';
import type { InterpretationWorkflowDraft } from './workflow.js';

export interface InterpretationItem {
  readonly reference: string;
  readonly profile?: ProfileReference;
  readonly referenceStatus?: 'identified' | 'uncertain';
}

export interface InterpretationComponent {
  readonly reference: string;
  readonly itemReference: string;
  readonly key: string;
  readonly schemaVersion: number;
  readonly value: ComponentValue;
  readonly sourceLocators?: readonly SourceLocator[];
  readonly validTime?: ValidTime;
  readonly status?: CandidateStatus;
  readonly supersedesReference?: string;
}

export interface ReferenceResolutionRequest {
  readonly reference: string;
  readonly question: string;
  readonly candidateItemIds: readonly string[];
}

export interface ReferenceDecision {
  readonly reference: string;
  readonly selectedItemId?: string;
}

export interface RegisterInterpretationInput {
  readonly entryId: string;
  readonly items: readonly InterpretationItem[];
  readonly components: readonly InterpretationComponent[];
  readonly referenceResolutions?: readonly ReferenceResolutionRequest[];
  readonly referenceDecisions?: readonly ReferenceDecision[];
  readonly workflows?: readonly InterpretationWorkflowDraft[];
}
