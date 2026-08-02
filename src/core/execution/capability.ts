import { DomainError } from '../error.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import type { ComponentValue } from '../item/types.js';
import type { AutonomyLevel } from './policy.js';

export interface CapabilityResult {
  readonly kind: 'success' | 'failure' | 'uncertain' | 'unsupported';
  readonly output?: ComponentValue;
  readonly message?: string;
  readonly events?: readonly { readonly key: string; readonly data: ComponentValue }[];
}

export interface CapabilityContext {
  readonly intentId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
}

export interface Capability {
  readonly key: string;
  readonly version: number;
  readonly description: string;
  readonly defaultAutonomy: AutonomyLevel;
  readonly safetyCeiling: AutonomyLevel;
  validateInput(input: ComponentValue): void;
  idempotencyKey(input: ComponentValue, intentId: string): string;
  execute(input: ComponentValue, context: CapabilityContext): Promise<CapabilityResult>;
}

/** Append-only executable boundary catalog. */
export class CapabilityRegistry {
  readonly #capabilities = new Map<string, Capability>();
  register(capability: Capability): void {
    assertRegistryKey(capability.key, 'Capability key');
    assertVersion(capability.version, 'Capability version');
    const id = `${capability.key}@${capability.version}`;
    if (this.#capabilities.has(id)) throw new DomainError(`Capability ${id} is already registered`);
    this.#capabilities.set(
      id,
      Object.freeze({
        key: capability.key,
        version: capability.version,
        description: capability.description,
        defaultAutonomy: capability.defaultAutonomy,
        safetyCeiling: capability.safetyCeiling,
        validateInput: capability.validateInput.bind(capability),
        idempotencyKey: capability.idempotencyKey.bind(capability),
        execute: capability.execute.bind(capability),
      }),
    );
  }
  find(key: string, version: number): Capability | undefined {
    return this.#capabilities.get(`${key}@${version}`);
  }
  require(key: string, version: number): Capability {
    const capability = this.find(key, version);
    if (!capability) throw new DomainError(`Capability ${key}@${version} is not registered`);
    return capability;
  }
  list(): readonly Capability[] {
    return Object.freeze([...this.#capabilities.values()]);
  }
}
