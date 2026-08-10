import type { Event } from '../../../core/execution/event.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';
import type { Condition } from '../../../core/state/condition.js';
import type { PlanningRecord } from '../../planning/operations/query.js';
import type { StateViewItem } from '../../state/operations/list.js';
import type { SuggestionUrgency } from './suggestion.js';

export interface DetectorDependencies {
  readonly profiles?: readonly string[];
  readonly componentKeys?: readonly string[];
  readonly eventKeys?: readonly string[];
  readonly state?: boolean;
}
export type ProactivitySignal =
  | { readonly kind: 'scan' }
  | {
      readonly kind: 'knowledge';
      readonly itemIds: readonly string[];
      readonly componentKeys: readonly string[];
      readonly profiles?: readonly string[];
    }
  | { readonly kind: 'event'; readonly event: Event }
  | { readonly kind: 'state'; readonly itemIds: readonly string[] };
export interface DetectorFinding {
  readonly subjectItemId?: string;
  readonly relevantState: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly rationale: string;
  readonly expectedEffect: string;
  readonly urgency: SuggestionUrgency;
  readonly expiresInMs: number;
  readonly capability: { readonly key: string; readonly version: number };
  readonly input: ComponentValue;
  readonly conditions: readonly Condition[];
}
export interface DetectorContext {
  readonly signal: ProactivitySignal;
  readonly snapshot: KnowledgeSnapshot;
  readonly planning: {
    readonly actionable: readonly PlanningRecord[];
    readonly blocked: readonly PlanningRecord[];
    readonly overdue: readonly PlanningRecord[];
    readonly progress: readonly PlanningRecord[];
    readonly pending: readonly PlanningRecord[];
  };
  readonly states: {
    readonly required: readonly StateViewItem[];
    readonly forbidden: readonly StateViewItem[];
  };
  readonly now: Date;
}
export interface ProactiveDetector {
  readonly key: string;
  readonly version: number;
  readonly description: string;
  readonly dependencies: DetectorDependencies;
  detect(context: DetectorContext): readonly DetectorFinding[];
}
