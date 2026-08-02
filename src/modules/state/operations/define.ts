import { assertText } from '../../../core/knowledge/guard.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { ConflictError } from '../../../system/error.js';
import type { DerivedStateDefinition } from '../domain/definition.js';

/** Runtime catalog of reconstructible State definitions; definitions themselves are not State persistence. */
export class DerivedStateRegistry {
  readonly #definitions = new Map<string, DerivedStateDefinition>();
  constructor(private readonly operators: OperatorRegistry) {}
  register(definition: DerivedStateDefinition): void {
    assertText(definition.id, 'Derived State id'); assertText(definition.description, 'Derived State description'); this.operators.validate(definition.condition);
    if (this.#definitions.has(definition.id)) throw new ConflictError(`Derived State ${definition.id} already exists`);
    this.#definitions.set(definition.id, Object.freeze({ ...definition }));
  }
  list(): readonly DerivedStateDefinition[] { return Object.freeze([...this.#definitions.values()]); }
}
