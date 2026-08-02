import type { Modality, State } from '../../../../core/state/state.js';
import { ConflictError } from '../../../../system/error.js';
import type { StateStore } from '../../ports/store.js';

/** In-memory State persistence indexed by modality for the read paths measured by this change. */
export class MemoryStateStore implements StateStore {
  readonly #states = new Map<string, State>();
  readonly #byModality = new Map<Modality, Set<string>>();

  async saveState(state: State): Promise<void> {
    const existing = this.#states.get(state.id);
    if (existing && existing !== state) throw new ConflictError(`State id ${state.id} already exists`);
    this.#states.set(state.id, state);
    const ids = this.#byModality.get(state.modality) ?? new Set<string>();
    ids.add(state.id);
    this.#byModality.set(state.modality, ids);
  }

  async listStates(modality?: Modality): Promise<readonly State[]> {
    if (!modality) return Object.freeze([...this.#states.values()]);
    return Object.freeze([...(this.#byModality.get(modality) ?? [])].map((id) => this.#states.get(id)).filter((state): state is State => Boolean(state)));
  }
}
