import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import { isCondition, type Condition, type Evaluation } from '../../../core/state/condition.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import type { Clock } from '../../../system/runtime.js';

export interface ConditionDependencies { readonly itemIds: readonly string[]; readonly componentKeys: readonly string[]; readonly usesTime: boolean }

/** Pure deterministic Condition evaluation over one immutable snapshot and clock value. */
export class StateEvaluator {
  constructor(private readonly operators: OperatorRegistry, private readonly clock: Clock) {}

  evaluate(condition: Condition, snapshot: KnowledgeSnapshot): Evaluation {
    this.operators.validate(condition);
    const context = Object.freeze({ snapshot, now: this.clock.now() });
    const evaluate = (current: Condition): Evaluation => this.operators.require(current.operator.key, current.operator.version).evaluate(current, context, evaluate);
    return evaluate(condition);
  }

  measure(condition: Condition, snapshot: KnowledgeSnapshot): { readonly result: Evaluation; readonly nodes: number; readonly durationMs: number; readonly dependencies: ConditionDependencies } {
    let nodes = 0;
    this.operators.validate(condition);
    const context = Object.freeze({ snapshot, now: this.clock.now() });
    const started = performance.now();
    const evaluate = (current: Condition): Evaluation => { nodes += 1; return this.operators.require(current.operator.key, current.operator.version).evaluate(current, context, evaluate); };
    const result = evaluate(condition);
    return Object.freeze({ result, nodes, durationMs: Math.max(0, performance.now() - started), dependencies: collectConditionDependencies(condition) });
  }
}

/** Static dependency metadata used to avoid evaluating unrelated State after future changes. */
export function collectConditionDependencies(condition: Condition): ConditionDependencies {
  const itemIds = new Set<string>(); const componentKeys = new Set<string>(); let usesTime = false;
  const visit = (current: Condition): void => {
    for (const operand of current.operands) {
      if (isCondition(operand)) visit(operand);
      else if (operand.kind === 'component') { itemIds.add(operand.itemId); componentKeys.add(operand.key); }
      else if (operand.kind === 'now') usesTime = true;
    }
  };
  visit(condition);
  return Object.freeze({ itemIds: Object.freeze([...itemIds].sort()), componentKeys: Object.freeze([...componentKeys].sort()), usesTime });
}
