import type { State, Modality } from '../../../core/state/state.js';

export interface StateStore {
  saveState(state: State): Promise<void>;
  listStates(modality?: Modality): Promise<readonly State[]>;
}
