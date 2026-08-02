import type { Event } from '../../../core/execution/event.js';
import type { Rule } from '../../../core/rule/rule.js';

export interface RuleRuntime {
  readonly rule: Rule;
  readonly nextEvaluationAt?: string;
  readonly lastProducedAt?: string;
  readonly occurrences: number;
  readonly deduplicationIds: ReadonlySet<string>;
}
export interface RuleEvaluationResult {
  readonly id: string;
  readonly ruleId: string;
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
export interface RuleStore {
  save(runtime: RuleRuntime): Promise<void>;
  find(id: string): Promise<RuleRuntime | undefined>;
  list(): Promise<readonly RuleRuntime[]>;
  due(at: string): Promise<readonly RuleRuntime[]>;
  forEvent(event: Event): Promise<readonly RuleRuntime[]>;
  forStateChange(signal: StateChangeSignal): Promise<readonly RuleRuntime[]>;
  appendResult(result: RuleEvaluationResult): Promise<void>;
  listResults(ruleId: string): Promise<readonly RuleEvaluationResult[]>;
}
