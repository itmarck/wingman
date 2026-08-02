import { DomainError } from '../../core/error.js';
import { assertRegistryKey, assertVersion } from '../../core/item/item.js';
import type { ProactiveDetector, ProactivitySignal } from './domain/detector.js';

/** Immutable detector catalog with dependency-driven selection. */
export class DetectorRegistry {
  readonly #detectors = new Map<string, ProactiveDetector>();
  readonly #components = new Map<string, Set<string>>();
  readonly #profiles = new Map<string, Set<string>>();
  readonly #events = new Map<string, Set<string>>();
  readonly #state = new Set<string>();
  register(detector: ProactiveDetector): void {
    assertRegistryKey(detector.key, 'Detector key');
    assertVersion(detector.version, 'Detector version');
    const id = `${detector.key}@${detector.version}`;
    if (this.#detectors.has(id)) throw new DomainError(`Detector ${id} is already registered`);
    this.#detectors.set(id, Object.freeze(detector));
    for (const key of detector.dependencies.componentKeys ?? []) add(this.#components, key, id);
    for (const profile of detector.dependencies.profiles ?? []) add(this.#profiles, profile, id);
    for (const key of detector.dependencies.eventKeys ?? []) add(this.#events, key, id);
    if (detector.dependencies.state) this.#state.add(id);
  }
  relevant(signal: ProactivitySignal): readonly ProactiveDetector[] {
    if (signal.kind === 'scan') return Object.freeze([...this.#detectors.values()]);
    const ids = new Set<string>();
    if (signal.kind === 'event') collect(ids, this.#events.get(signal.event.key));
    else if (signal.kind === 'state') collect(ids, this.#state);
    else {
      for (const key of signal.componentKeys) collect(ids, this.#components.get(key));
      for (const profile of signal.profiles ?? []) collect(ids, this.#profiles.get(profile));
    }
    return Object.freeze([...ids].flatMap((id) => this.#detectors.get(id) ?? []));
  }
  list(): readonly ProactiveDetector[] {
    return Object.freeze([...this.#detectors.values()]);
  }
}
function add(index: Map<string, Set<string>>, key: string, id: string): void {
  const ids = index.get(key) ?? new Set<string>();
  ids.add(id);
  index.set(key, ids);
}
function collect(target: Set<string>, source?: ReadonlySet<string>): void {
  for (const id of source ?? []) target.add(id);
}
