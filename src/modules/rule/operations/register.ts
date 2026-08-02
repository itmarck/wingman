import type { CapabilityRegistry } from '../../../core/execution/capability.js';
import type { TriggerRegistry } from '../../../core/rule/registry.js';
import { type CreateRuleInput, Rule } from '../../../core/rule/rule.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { RuleStore } from '../ports/store.js';

export type RegisterRuleInput = Omit<CreateRuleInput, 'id' | 'createdAt' | 'status'>;
export class RegisterRuleCommand {
  constructor(
    private readonly store: RuleStore,
    private readonly triggers: TriggerRegistry,
    private readonly operators: OperatorRegistry,
    private readonly capabilities: CapabilityRegistry,
    private readonly knowledge: InterpretationStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: RegisterRuleInput): Promise<string> {
    this.triggers.require(input.when.operator.key, input.when.operator.version);
    for (const condition of [
      ...input.given,
      ...(input.policy?.stopWhen ? [input.policy.stopWhen] : []),
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
    const rule = Rule.create({
      ...input,
      id: this.ids.generate(),
      createdAt: this.clock.now().toISOString(),
    });
    if (await this.store.find(rule.id)) throw new ConflictError(`Rule ${rule.id} already exists`);
    await this.store.save({
      rule,
      nextEvaluationAt: initialTime(rule),
      occurrences: 0,
      deduplicationIds: new Set(),
    });
    return rule.id;
  }
}
function initialTime(rule: Rule): string | undefined {
  if (rule.when.operator.key !== 'time') return undefined;
  const trigger = rule.when as Extract<
    Rule['when'],
    { readonly operator: { readonly key: 'time' } }
  >;
  return trigger.at ?? new Date(Date.parse(rule.createdAt) + (trigger.afterMs ?? 0)).toISOString();
}
