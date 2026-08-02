import type { Event } from '../../../../core/execution/event.js';
import type {
  RuleEvaluationResult,
  RuleRuntime,
  RuleStore,
  StateChangeSignal,
} from '../../ports/store.js';

/** Dependency-indexed memory registry; event/state signals never scan unrelated Rules. */
export class MemoryRuleStore implements RuleStore {
  readonly #rules = new Map<string, RuleRuntime>();
  readonly #eventIndex = new Map<string, Set<string>>();
  readonly #itemIndex = new Map<string, Set<string>>();
  readonly #componentIndex = new Map<string, Set<string>>();
  readonly #results: RuleEvaluationResult[] = [];
  async save(runtime: RuleRuntime): Promise<void> {
    this.#rules.set(runtime.rule.id, freezeRuntime(runtime));
    this.index(runtime);
  }
  async find(id: string): Promise<RuleRuntime | undefined> {
    return this.#rules.get(id);
  }
  async list(): Promise<readonly RuleRuntime[]> {
    return Object.freeze([...this.#rules.values()]);
  }
  async due(at: string): Promise<readonly RuleRuntime[]> {
    return Object.freeze(
      [...this.#rules.values()]
        .filter(
          (runtime) =>
            runtime.rule.status === 'active' &&
            runtime.nextEvaluationAt &&
            runtime.nextEvaluationAt <= at,
        )
        .sort(comparePriority),
    );
  }
  async forEvent(event: Event): Promise<readonly RuleRuntime[]> {
    return this.resolve(this.#eventIndex.get(event.key));
  }
  async forStateChange(signal: StateChangeSignal): Promise<readonly RuleRuntime[]> {
    const ids = new Set<string>();
    for (const itemId of signal.itemIds)
      for (const id of this.#itemIndex.get(itemId) ?? []) ids.add(id);
    for (const key of signal.componentKeys)
      for (const id of this.#componentIndex.get(key) ?? []) ids.add(id);
    return this.resolve(ids);
  }
  async appendResult(result: RuleEvaluationResult): Promise<void> {
    this.#results.push(
      Object.freeze({ ...result, intentIds: Object.freeze([...result.intentIds]) }),
    );
  }
  async listResults(ruleId: string): Promise<readonly RuleEvaluationResult[]> {
    return Object.freeze(this.#results.filter((result) => result.ruleId === ruleId));
  }
  private resolve(ids?: ReadonlySet<string>): readonly RuleRuntime[] {
    return Object.freeze(
      [...(ids ?? [])]
        .map((id) => this.#rules.get(id))
        .filter((value): value is RuleRuntime => Boolean(value))
        .filter((value) => value.rule.status === 'active')
        .sort(comparePriority),
    );
  }
  private index(runtime: RuleRuntime): void {
    const trigger = runtime.rule.when;
    if (trigger.operator.key === 'event') {
      const event = trigger as Extract<
        typeof trigger,
        { readonly operator: { readonly key: 'event' } }
      >;
      add(this.#eventIndex, event.eventKey, runtime.rule.id);
    }
    if (trigger.operator.key === 'stateChange') {
      const stateChange = trigger as Extract<
        typeof trigger,
        { readonly operator: { readonly key: 'stateChange' } }
      >;
      for (const id of stateChange.itemIds ?? []) add(this.#itemIndex, id, runtime.rule.id);
      for (const key of stateChange.componentKeys ?? [])
        add(this.#componentIndex, key, runtime.rule.id);
    }
  }
}
function add(index: Map<string, Set<string>>, key: string, id: string): void {
  const values = index.get(key) ?? new Set<string>();
  values.add(id);
  index.set(key, values);
}
function freezeRuntime(runtime: RuleRuntime): RuleRuntime {
  return Object.freeze({ ...runtime, deduplicationIds: new Set(runtime.deduplicationIds) });
}
function comparePriority(left: RuleRuntime, right: RuleRuntime): number {
  return (
    (right.rule.policy.priority ?? 0) - (left.rule.policy.priority ?? 0) ||
    left.rule.id.localeCompare(right.rule.id)
  );
}
