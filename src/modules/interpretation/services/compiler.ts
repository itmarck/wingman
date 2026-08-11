import { Automation } from '../../../core/automation/automation.js';
import type { TriggerRegistry } from '../../../core/automation/registry.js';
import type { CapabilityRegistry } from '../../../core/execution/capability.js';
import { Intent } from '../../../core/execution/intent.js';
import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { OperatorRegistry } from '../../../core/state/registry.js';
import { State } from '../../../core/state/state.js';
import { InvalidInputError } from '../../../system/error.js';
import type { IdGenerator } from '../../../system/runtime.js';
import type { AutomationRuntime } from '../../automation/ports/store.js';
import type { InterpretationDeclaration, ItemDeclaration } from '../domain/declaration.js';
import type { InterpretationDraft } from '../domain/input.js';
import type {
  DeclarationOutcome,
  DeclarationOutcomeStatus,
  InterpretationPublicationPlan,
} from '../ports.js';
import { createRegistration } from './registration.js';

/** Compiles one complete Draft into immutable domain facts without persisting them. */
export class InterpretationCompiler {
  constructor(
    private readonly schemas: SchemaRegistry,
    private readonly operators: OperatorRegistry,
    private readonly triggers: TriggerRegistry,
    private readonly capabilities: CapabilityRegistry,
  ) {}

  compile(
    interpretationId: string,
    draft: InterpretationDraft,
    snapshot: KnowledgeSnapshot,
    recordedAt: string,
  ): InterpretationPublicationPlan {
    const ids = stableIds(interpretationId);
    const decisions = new Map(
      (draft.decisions ?? []).map((decision) => [decision.reference, decision] as const),
    );
    const prepared = createRegistration(draft, snapshot, decisions, this.schemas, ids, recordedAt);
    const targets = new Map([...prepared.targets].map(([reference, item]) => [reference, item.id]));
    const outcomes = new Map<string, DeclarationOutcome>();
    const states = this.profileStates(draft, prepared.registration.items, targets, ids, recordedAt);
    const automations: AutomationRuntime[] = [];
    const intents: Intent[] = [];
    const pending = [...draft.declarations];

    while (pending.length > 0) {
      const ready = pending.filter((declaration) =>
        (declaration.dependsOn ?? []).every(
          (reference) =>
            outcomes.has(reference) || !pending.some(({ reference: value }) => value === reference),
        ),
      );
      if (ready.length === 0) {
        throw new InvalidInputError('Declaration dependencies form a cycle');
      }
      for (const declaration of ready) {
        pending.splice(pending.indexOf(declaration), 1);
        const blocked = (declaration.dependsOn ?? [])
          .map((reference) => outcomes.get(reference))
          .find((candidate) => candidate?.status !== 'applied');
        if (blocked) {
          const status =
            blocked.status === 'needsInput'
              ? 'needsInput'
              : blocked.status === 'unsupported'
                ? 'unsupported'
                : 'failed';
          outcomes.set(
            declaration.reference,
            outcome(
              draft,
              declaration,
              status,
              recordedAt,
              undefined,
              'A declaration dependency was not applied',
            ),
          );
          continue;
        }
        if ((declaration.unresolved?.length ?? 0) > 0) {
          outcomes.set(
            declaration.reference,
            outcome(
              draft,
              declaration,
              'needsInput',
              recordedAt,
              undefined,
              'Declaration contains unresolved source values',
              { unresolved: declaration.unresolved ?? [] },
            ),
          );
          continue;
        }
        const targetId = this.materialize(
          declaration,
          draft,
          targets,
          states,
          automations,
          intents,
          ids,
          recordedAt,
        );
        targets.set(declaration.reference, targetId);
        outcomes.set(
          declaration.reference,
          outcome(draft, declaration, 'applied', recordedAt, targetId),
        );
      }
    }

    return Object.freeze({
      ...prepared.registration,
      states: Object.freeze(states),
      automations: Object.freeze(automations),
      intents: Object.freeze(intents),
      outcomes: Object.freeze([...outcomes.values()]),
      publication: prepared.publication,
    });
  }

  private materialize(
    declaration: InterpretationDeclaration,
    draft: InterpretationDraft,
    targets: ReadonlyMap<string, string>,
    states: State[],
    automations: AutomationRuntime[],
    intents: Intent[],
    ids: IdGenerator,
    recordedAt: string,
  ): string {
    if (declaration.kind === 'item') {
      const target = targets.get(declaration.reference);
      if (!target) throw new Error(`Item declaration ${declaration.reference} was not compiled`);
      return target;
    }
    const evidence = [{ entryId: draft.entryId, sourceLocators: [] }] as const;
    if (declaration.kind === 'state') {
      this.operators.validate(resolveReferences(declaration.condition, targets));
      const state = State.create({
        ...declaration,
        id: ids.generate(),
        condition: resolveReferences(declaration.condition, targets),
        author: { kind: 'inference' },
        evidence,
        recordedAt,
      });
      states.push(state);
      return state.id;
    }
    if (declaration.kind === 'automation') {
      const id = ids.generate();
      const references = new Map(targets).set(declaration.reference, id);
      const automation = Automation.create({
        ...declaration,
        id,
        subjects: declaration.subjects?.map((reference) => ({
          kind: 'itemReference',
          itemId: references.get(reference) ?? reference,
        })),
        given: resolveReferences(declaration.given, references),
        when: resolveReferences(declaration.when, references),
        thenIntents: resolveReferences(declaration.thenIntents, references),
        controls: declaration.controls
          ? resolveReferences(declaration.controls, references)
          : undefined,
        evidence,
        createdAt: recordedAt,
      });
      this.triggers
        .require(automation.when.operator.key, automation.when.operator.version)
        .validate(automation.when);
      for (const condition of [
        ...automation.given,
        ...(automation.controls.stopWhen ? [automation.controls.stopWhen] : []),
      ])
        this.operators.validate(condition);
      for (const template of automation.thenIntents) {
        this.capabilities
          .require(template.capability.key, template.capability.version)
          .validateInput(template.input);
        for (const condition of [...template.conditions, ...template.expectedState])
          this.operators.validate(condition);
      }
      automations.push(runtime(automation));
      return id;
    }
    const input = resolveReferences(declaration.input, targets);
    this.capabilities
      .require(declaration.capability.key, declaration.capability.version)
      .validateInput(input);
    const conditions = resolveReferences(declaration.conditions, targets);
    const expectedState = resolveReferences(declaration.expectedState, targets);
    for (const condition of [...conditions, ...expectedState]) this.operators.validate(condition);
    const intent = Intent.create({
      ...declaration,
      id: ids.generate(),
      input,
      conditions,
      expectedState,
      proposer: { kind: 'system' },
      evidence,
      createdAt: recordedAt,
    });
    intents.push(intent);
    return intent.id;
  }

  private profileStates(
    draft: InterpretationDraft,
    items: readonly import('../../../core/item/item.js').Item[],
    targets: ReadonlyMap<string, string>,
    ids: IdGenerator,
    recordedAt: string,
  ): State[] {
    const result: State[] = [];
    for (const declaration of draft.declarations.filter(
      (value): value is ItemDeclaration => value.kind === 'item',
    )) {
      if (!declaration.profile || (declaration.unresolved?.length ?? 0) > 0) continue;
      const itemId = targets.get(declaration.reference);
      if (!itemId || !items.some(({ id }) => id === itemId)) continue;
      const profile = this.schemas.requireProfile(
        declaration.profile.key,
        declaration.profile.version,
      );
      for (const template of profile.states ?? []) {
        const condition = {
          operator: template.operator,
          operands: [
            {
              kind: 'component' as const,
              itemId,
              key: template.component.key,
              field: template.component.field,
            },
            { kind: 'literal' as const, value: template.value },
          ],
        };
        this.operators.validate(condition);
        result.push(
          State.create({
            id: ids.generate(),
            modality: template.modality,
            condition,
            author: { kind: 'inference' },
            evidence: [{ entryId: draft.entryId, sourceLocators: [] }],
            recordedAt,
          }),
        );
      }
    }
    return result;
  }
}

function stableIds(interpretationId: string): IdGenerator {
  let sequence = 0;
  return { generate: () => `${interpretationId}:publication:${++sequence}` };
}

function outcome(
  draft: InterpretationDraft,
  declaration: InterpretationDeclaration,
  status: DeclarationOutcomeStatus,
  recordedAt: string,
  targetId?: string,
  reason?: string,
  details?: ComponentValue,
): DeclarationOutcome {
  return Object.freeze({
    entryId: draft.entryId,
    reference: declaration.reference,
    kind: declaration.kind,
    status,
    targetId,
    reason,
    details,
    recordedAt,
  });
}

function resolveReferences<Value>(value: Value, targets: ReadonlyMap<string, string>): Value {
  if (Array.isArray(value)) return value.map((child) => resolveReferences(child, targets)) as Value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key.endsWith('Id') && typeof child === 'string' && targets.has(child)
          ? targets.get(child)
          : resolveReferences(child, targets),
      ]),
    ) as Value;
  return value;
}

function runtime(automation: Automation): AutomationRuntime {
  const trigger = automation.when;
  const nextEvaluationAt =
    trigger.operator.key === 'schedule'
      ? (
          trigger as Extract<
            Automation['when'],
            { readonly operator: { readonly key: 'schedule' } }
          >
        ).occurrences[0]
      : trigger.operator.key === 'time'
        ? (() => {
            const time = trigger as Extract<
              Automation['when'],
              { readonly operator: { readonly key: 'time' } }
            >;
            return (
              time.at ??
              new Date(Date.parse(automation.createdAt) + (time.afterMs ?? 0)).toISOString()
            );
          })()
        : undefined;
  return Object.freeze({
    automation,
    nextEvaluationAt,
    occurrences: 0,
    deduplicationIds: new Set<string>(),
  });
}
