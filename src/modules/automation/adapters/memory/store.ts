import type { Event } from '../../../../core/execution/event.js';
import type {
  AutomationEvaluationResult,
  AutomationRuntime,
  AutomationStore,
  StateChangeSignal,
} from '../../ports/store.js';

/** Dependency-indexed memory registry; event/state signals never scan unrelated Automations. */
export class MemoryAutomationStore implements AutomationStore {
  readonly #automations = new Map<string, AutomationRuntime>();
  readonly #eventIndex = new Map<string, Set<string>>();
  readonly #itemIndex = new Map<string, Set<string>>();
  readonly #componentIndex = new Map<string, Set<string>>();
  readonly #results: AutomationEvaluationResult[] = [];
  async save(runtime: AutomationRuntime): Promise<void> {
    this.#automations.set(runtime.automation.id, freezeRuntime(runtime));
    this.index(runtime);
  }
  async find(id: string): Promise<AutomationRuntime | undefined> {
    return this.#automations.get(id);
  }
  async list(): Promise<readonly AutomationRuntime[]> {
    return Object.freeze([...this.#automations.values()]);
  }
  async due(at: string): Promise<readonly AutomationRuntime[]> {
    return Object.freeze(
      [...this.#automations.values()]
        .filter(
          (runtime) =>
            runtime.automation.status === 'active' &&
            runtime.nextEvaluationAt &&
            runtime.nextEvaluationAt <= at,
        )
        .sort(comparePriority),
    );
  }
  async forEvent(event: Event): Promise<readonly AutomationRuntime[]> {
    return this.resolve(this.#eventIndex.get(event.key));
  }
  async forStateChange(signal: StateChangeSignal): Promise<readonly AutomationRuntime[]> {
    const ids = new Set<string>();
    for (const itemId of signal.itemIds)
      for (const id of this.#itemIndex.get(itemId) ?? []) ids.add(id);
    for (const key of signal.componentKeys)
      for (const id of this.#componentIndex.get(key) ?? []) ids.add(id);
    return this.resolve(ids);
  }
  async appendResult(result: AutomationEvaluationResult): Promise<void> {
    this.#results.push(
      Object.freeze({ ...result, intentIds: Object.freeze([...result.intentIds]) }),
    );
  }
  async listResults(automationId: string): Promise<readonly AutomationEvaluationResult[]> {
    return Object.freeze(this.#results.filter((result) => result.automationId === automationId));
  }
  private resolve(ids?: ReadonlySet<string>): readonly AutomationRuntime[] {
    return Object.freeze(
      [...(ids ?? [])]
        .map((id) => this.#automations.get(id))
        .filter((value): value is AutomationRuntime => Boolean(value))
        .filter((value) => value.automation.status === 'active')
        .sort(comparePriority),
    );
  }
  private index(runtime: AutomationRuntime): void {
    const trigger = runtime.automation.when;
    if (trigger.operator.key === 'event') {
      const event = trigger as Extract<
        typeof trigger,
        { readonly operator: { readonly key: 'event' } }
      >;
      add(this.#eventIndex, event.eventKey, runtime.automation.id);
    }
    if (trigger.operator.key === 'stateChange') {
      const stateChange = trigger as Extract<
        typeof trigger,
        { readonly operator: { readonly key: 'stateChange' } }
      >;
      for (const id of stateChange.itemIds ?? []) add(this.#itemIndex, id, runtime.automation.id);
      for (const key of stateChange.componentKeys ?? [])
        add(this.#componentIndex, key, runtime.automation.id);
    }
  }
}
function add(index: Map<string, Set<string>>, key: string, id: string): void {
  const values = index.get(key) ?? new Set<string>();
  values.add(id);
  index.set(key, values);
}
function freezeRuntime(runtime: AutomationRuntime): AutomationRuntime {
  return Object.freeze({ ...runtime, deduplicationIds: new Set(runtime.deduplicationIds) });
}
function comparePriority(left: AutomationRuntime, right: AutomationRuntime): number {
  return (
    (right.automation.controls.priority ?? 0) - (left.automation.controls.priority ?? 0) ||
    left.automation.id.localeCompare(right.automation.id)
  );
}
