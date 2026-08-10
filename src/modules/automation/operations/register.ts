import { Automation, type CreateAutomationInput } from '../../../core/automation/automation.js';
import type { TriggerRegistry } from '../../../core/automation/registry.js';
import type { CapabilityRegistry } from '../../../core/execution/capability.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports.js';
import type { AutomationStore } from '../ports/store.js';

export type RegisterAutomationInput = Omit<CreateAutomationInput, 'id' | 'createdAt' | 'status'> & {
  readonly id?: string;
};
export class RegisterAutomationCommand {
  constructor(
    private readonly store: AutomationStore,
    private readonly triggers: TriggerRegistry,
    private readonly operators: OperatorRegistry,
    private readonly capabilities: CapabilityRegistry,
    private readonly knowledge: InterpretationStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: RegisterAutomationInput): Promise<string> {
    this.triggers
      .require(input.when.operator.key, input.when.operator.version)
      .validate(input.when);
    for (const condition of [
      ...input.given,
      ...(input.controls?.stopWhen ? [input.controls.stopWhen] : []),
    ])
      this.operators.validate(condition);
    for (const template of input.thenIntents) {
      const capability = this.capabilities.require(
        template.capability.key,
        template.capability.version,
      );
      capability.validateInput(template.input);
      for (const condition of [...template.conditions, ...template.expectedState])
        this.operators.validate(condition);
    }
    const snapshot = await this.knowledge.loadKnowledge();
    for (const evidence of input.evidence)
      if (!snapshot.entries.some((entry) => entry.id === evidence.entryId))
        throw new InvalidInputError(`Entry ${evidence.entryId} does not exist`);
    const automation = Automation.create({
      ...input,
      id: input.id ?? this.ids.generate(),
      createdAt: this.clock.now().toISOString(),
    });
    if (await this.store.find(automation.id))
      throw new ConflictError(`Automation ${automation.id} already exists`);
    await this.store.save({
      automation,
      nextEvaluationAt: initialTime(automation),
      occurrences: 0,
      deduplicationIds: new Set(),
    });
    return automation.id;
  }
}
function initialTime(automation: Automation): string | undefined {
  if (automation.when.operator.key === 'schedule')
    return (automation.when as Extract<Automation['when'], { operator: { key: 'schedule' } }>)
      .occurrences[0];
  if (automation.when.operator.key !== 'time') return undefined;
  const trigger = automation.when as Extract<
    Automation['when'],
    { readonly operator: { readonly key: 'time' } }
  >;
  return (
    trigger.at ?? new Date(Date.parse(automation.createdAt) + (trigger.afterMs ?? 0)).toISOString()
  );
}
