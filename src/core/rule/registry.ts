import { DomainError } from '../error.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { RuleTrigger } from './rule.js';

export interface TriggerOperator {
  readonly key: RuleTrigger['operator']['key'];
  readonly version: number;
  readonly description: string;
}
/** Immutable catalog of the tagged trigger language. */
export class TriggerRegistry {
  readonly #operators = new Map<string, TriggerOperator>();
  register(operator: TriggerOperator): void {
    assertRegistryKey(operator.key, 'Trigger operator key');
    assertVersion(operator.version, 'Trigger operator version');
    const id = `${operator.key}@${operator.version}`;
    if (this.#operators.has(id))
      throw new DomainError(`Trigger operator ${id} is already registered`);
    this.#operators.set(id, Object.freeze({ ...operator }));
  }
  require(key: string, version: number): TriggerOperator {
    const operator = this.#operators.get(`${key}@${version}`);
    if (!operator) throw new DomainError(`Trigger operator ${key}@${version} is not registered`);
    return operator;
  }
}
export function createTriggerRegistry(): TriggerRegistry {
  const registry = new TriggerRegistry();
  for (const key of ['time', 'event', 'stateChange'] as const)
    registry.register({ key, version: 1, description: `Trigger ${key}` });
  return registry;
}
