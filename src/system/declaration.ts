import type { ComponentValue } from '../core/item/types.js';
import type { RegisterAutomationCommand } from '../modules/automation/operations/register.js';
import type { ProposeIntentCommand } from '../modules/execution/operations/propose.js';
import type { DeclarationOutcomeStore } from '../modules/interpretation/adapters/memory/declaration.js';
import type { InterpretationDeclaration } from '../modules/interpretation/domain/declaration.js';
import type { RegisterInterpretationInput } from '../modules/interpretation/domain/input.js';
import type {
  DeclarationOutcomeStatus,
  InterpretationDeclarationPublisher,
} from '../modules/interpretation/ports/declaration.js';
import type { ComposeItemCommand } from '../modules/knowledge/operations/compose.js';
import type { PersistStateInput } from '../modules/state/operations/create.js';
import type { Clock, IdGenerator } from './runtime.js';

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Publishes provider declarations through registered domain commands only. */
export class EntryDeclarationPublisher implements InterpretationDeclarationPublisher {
  constructor(
    private readonly outcomes: DeclarationOutcomeStore,
    private readonly items: Pick<ComposeItemCommand, 'execute'>,
    private readonly states: StateWriter,
    private readonly automations: Pick<RegisterAutomationCommand, 'execute'>,
    private readonly intents: Pick<ProposeIntentCommand, 'execute'>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterInterpretationInput): Promise<void> {
    const declarations = input.declarations;
    if (!declarations) return;
    const pending: InterpretationDeclaration[] = [
      ...declarations.items,
      ...declarations.states,
      ...declarations.automations,
      ...declarations.intents,
    ];
    const targets = new Map<string, string>();
    while (pending.length > 0) {
      const ready = pending.filter((declaration) =>
        (declaration.dependsOn ?? []).every(
          (reference) =>
            targets.has(reference) ||
            !pending.some((candidate) => candidate.reference === reference),
        ),
      );
      if (ready.length === 0) {
        for (const declaration of pending)
          await this.record(input.entryId, declaration, 'failed', {
            reason: 'Declaration dependencies form a cycle',
          });
        return;
      }
      for (const declaration of ready) {
        pending.splice(pending.indexOf(declaration), 1);
        const blocked = await Promise.all(
          (declaration.dependsOn ?? [])
            .filter((reference) => !targets.has(reference))
            .map((reference) => this.outcomes.find(input.entryId, reference)),
        );
        if (blocked.length > 0) {
          const status = blocked.some((outcome) => outcome?.status === 'needsInput')
            ? 'needsInput'
            : blocked.some((outcome) => outcome?.status === 'unsupported')
              ? 'unsupported'
              : 'failed';
          await this.record(input.entryId, declaration, status, {
            reason: 'A declaration dependency was not applied',
          });
          continue;
        }
        await this.apply(input.entryId, declaration, targets);
        const outcome = await this.outcomes.find(input.entryId, declaration.reference);
        if (outcome?.status === 'applied' && outcome.targetId)
          targets.set(declaration.reference, outcome.targetId);
      }
    }
  }

  private async apply(
    entryId: string,
    declaration: InterpretationDeclaration,
    targets: ReadonlyMap<string, string>,
  ): Promise<void> {
    if (await this.outcomes.find(entryId, declaration.reference)) return;
    if ((declaration.unresolved?.length ?? 0) > 0) {
      await this.record(entryId, declaration, 'needsInput', {
        reason: 'Declaration contains unresolved source values',
        details: { unresolved: declaration.unresolved ?? [] },
      });
      return;
    }
    const evidence = [{ entryId, sourceLocators: [] }] as const;
    try {
      let targetId: string;
      if (declaration.kind === 'item')
        targetId = await this.items.execute({
          profile: declaration.profile,
          components: declaration.components.map((component) => ({
            ...component,
            value: resolveReferences(component.value, targets),
          })),
          evidence,
        });
      else if (declaration.kind === 'state')
        targetId = await this.states.execute({
          modality: declaration.modality,
          condition: resolveReferences(declaration.condition, targets),
          author: { kind: 'inference' },
          evidence,
          validTime: declaration.validTime,
          confidence: declaration.confidence,
        });
      else if (declaration.kind === 'automation') {
        const id = this.ids.generate();
        const references = new Map(targets).set(declaration.reference, id);
        targetId = await this.automations.execute({
          id,
          subjects: declaration.subjects?.map((reference) => ({
            kind: 'itemReference' as const,
            itemId: references.get(reference) ?? reference,
          })),
          given: resolveReferences(declaration.given, references),
          when: resolveReferences(declaration.when, references),
          thenIntents: resolveReferences(declaration.thenIntents, references),
          controls: declaration.controls
            ? resolveReferences(declaration.controls, references)
            : undefined,
          evidence,
        });
      } else
        targetId = await this.intents.execute({
          capability: declaration.capability,
          input: resolveReferences(declaration.input, targets),
          conditions: resolveReferences(declaration.conditions, targets),
          expectedState: resolveReferences(declaration.expectedState, targets),
          consent: declaration.consent,
          trigger: declaration.trigger,
          proposer: { kind: 'system' },
          evidence,
        });
      await this.record(entryId, declaration, 'applied', { targetId });
    } catch (error) {
      const reason = message(error);
      await this.record(
        entryId,
        declaration,
        reason.includes('not registered') ? 'unsupported' : 'failed',
        { reason },
      );
    }
  }

  private async record(
    entryId: string,
    declaration: InterpretationDeclaration,
    status: DeclarationOutcomeStatus,
    result: {
      readonly targetId?: string;
      readonly reason?: string;
      readonly details?: ComponentValue;
    },
  ): Promise<void> {
    await this.outcomes.save({
      entryId,
      reference: declaration.reference,
      kind: declaration.kind,
      status,
      ...result,
      recordedAt: this.clock.now().toISOString(),
    });
  }
}

function resolveReferences<Value>(value: Value, targets: ReadonlyMap<string, string>): Value {
  if (Array.isArray(value)) return value.map((child) => resolveReferences(child, targets)) as Value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key.endsWith('Id') && typeof child === 'string' && targets.has(child)
          ? (targets.get(child) ?? child)
          : resolveReferences(child, targets),
      ]),
    ) as Value;
  return value;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
