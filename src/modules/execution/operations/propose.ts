import type { CapabilityRegistry } from '../../../core/execution/capability.js';
import { type CreateIntentInput, Intent } from '../../../core/execution/intent.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { ExecutionStore } from '../ports/store.js';

export type ProposeIntentInput = Omit<CreateIntentInput, 'id' | 'createdAt' | 'status'>;

export class ProposeIntentCommand {
  constructor(
    private readonly store: ExecutionStore,
    private readonly capabilities: CapabilityRegistry,
    private readonly operators: OperatorRegistry,
    private readonly knowledge: InterpretationStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ProposeIntentInput): Promise<string> {
    const capability = this.capabilities.require(input.capability.key, input.capability.version);
    capability.validateInput(input.input);
    for (const condition of [...input.conditions, ...input.expectedState]) {
      this.operators.validate(condition);
    }
    const snapshot = await this.knowledge.loadKnowledge();
    for (const evidence of input.evidence) {
      if (!snapshot.entries.some((entry) => entry.id === evidence.entryId)) {
        throw new InvalidInputError(`Entry ${evidence.entryId} does not exist`);
      }
    }
    const intent = Intent.create({
      ...input,
      id: this.ids.generate(),
      createdAt: this.clock.now().toISOString(),
    });
    await this.store.saveIntent(intent);
    return intent.id;
  }
}
