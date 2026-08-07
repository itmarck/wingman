import type { Automation } from '../../../core/automation/automation.js';
import type { Event } from '../../../core/execution/event.js';

export interface AutomationRuntime {
  readonly automation: Automation;
  readonly nextEvaluationAt?: string;
  readonly lastProducedAt?: string;
  readonly occurrences: number;
  readonly deduplicationIds: ReadonlySet<string>;
}
export interface AutomationEvaluationResult {
  readonly id: string;
  readonly automationId: string;
  readonly triggerId: string;
  readonly evaluatedAt: string;
  readonly outcome: 'produced' | 'givenFalse' | 'stopped' | 'expired' | 'cooldown' | 'duplicate';
  readonly intentIds: readonly string[];
  readonly reason: string;
}
export interface StateChangeSignal {
  readonly id: string;
  readonly occurredAt: string;
  readonly itemIds: readonly string[];
  readonly componentKeys: readonly string[];
}
export interface AutomationStore {
  save(runtime: AutomationRuntime): Promise<void>;
  find(id: string): Promise<AutomationRuntime | undefined>;
  list(): Promise<readonly AutomationRuntime[]>;
  due(at: string): Promise<readonly AutomationRuntime[]>;
  forEvent(event: Event): Promise<readonly AutomationRuntime[]>;
  forStateChange(signal: StateChangeSignal): Promise<readonly AutomationRuntime[]>;
  appendResult(result: AutomationEvaluationResult): Promise<void>;
  listResults(automationId: string): Promise<readonly AutomationEvaluationResult[]>;
}
