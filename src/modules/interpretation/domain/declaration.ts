import type {
  AutomationControls,
  AutomationTrigger,
  IntentTemplate,
} from '../../../core/automation/automation.js';
import type { CreateIntentInput } from '../../../core/execution/intent.js';
import type {
  CandidateStatus,
  ComponentValue,
  ProfileReference,
  ValidTime,
} from '../../../core/item/types.js';
import type { SourceLocator } from '../../../core/knowledge/source.js';
import type { Condition } from '../../../core/state/condition.js';
import type { Modality } from '../../../core/state/state.js';

export interface DeclarationBase {
  readonly reference: string;
  readonly version: 1;
  readonly dependsOn?: readonly string[];
  readonly unresolved?: readonly string[];
}

export interface ComponentDeclaration {
  readonly reference: string;
  readonly key: string;
  readonly schemaVersion: number;
  readonly value: ComponentValue;
  readonly sourceLocators?: readonly SourceLocator[];
  readonly validTime?: ValidTime;
  readonly status?: CandidateStatus;
  readonly supersedesReference?: string;
}

export interface ItemDeclaration extends DeclarationBase {
  readonly kind: 'item';
  readonly profile?: ProfileReference;
  readonly referenceStatus?: 'identified' | 'uncertain';
  readonly components: readonly ComponentDeclaration[];
}

export interface StateDeclaration extends DeclarationBase {
  readonly kind: 'state';
  readonly modality: Modality;
  readonly condition: Condition;
  readonly validTime?: ValidTime;
  readonly confidence?: number;
}

export interface AutomationDeclaration extends DeclarationBase {
  readonly kind: 'automation';
  readonly subjects?: readonly string[];
  readonly given: readonly Condition[];
  readonly when: AutomationTrigger;
  readonly thenIntents: readonly IntentTemplate[];
  readonly controls?: AutomationControls;
}

export interface IntentDeclaration extends DeclarationBase {
  readonly kind: 'intent';
  readonly capability: CreateIntentInput['capability'];
  readonly input: ComponentValue;
  readonly conditions: readonly Condition[];
  readonly expectedState: readonly Condition[];
  readonly consent: CreateIntentInput['consent'];
  readonly trigger: CreateIntentInput['trigger'];
}

export type InterpretationDeclaration =
  | ItemDeclaration
  | StateDeclaration
  | AutomationDeclaration
  | IntentDeclaration;
