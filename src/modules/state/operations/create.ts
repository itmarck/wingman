import { State, type CreateStateInput } from '../../../core/state/state.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { StateStore } from '../ports/store.js';

export type PersistStateInput = Omit<CreateStateInput, 'id' | 'recordedAt'>;

/** Persists modal meaning that cannot be reconstructed from Items alone. */
export class CreateStateCommand {
  constructor(private readonly states: StateStore, private readonly knowledge: InterpretationStore, private readonly operators: OperatorRegistry, private readonly ids: IdGenerator, private readonly clock: Clock) {}
  async execute(input: PersistStateInput): Promise<string> {
    this.operators.validate(input.condition);
    const snapshot = await this.knowledge.loadKnowledge();
    for (const evidence of input.evidence) if (!snapshot.entries.some((entry) => entry.id === evidence.entryId)) throw new InvalidInputError(`Entry ${evidence.entryId} does not exist`);
    const state = State.create({ ...input, id: this.ids.generate(), recordedAt: this.clock.now().toISOString() });
    await this.states.saveState(state);
    return state.id;
  }
}
