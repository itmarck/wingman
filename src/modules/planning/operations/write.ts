import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import { itemReference, selectCurrentRevisions } from '../../../core/item/registry.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';
import {
  initialStatus,
  type LifecycleValue,
  type PlanningProfile,
  planningProfiles,
  transitionLifecycle,
} from '../../../core/planning/lifecycle.js';
import type { Condition } from '../../../core/state/condition.js';
import { InvalidInputError, NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ItemStore } from '../../knowledge/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';

export interface CreatePlanningItemInput {
  readonly profile: PlanningProfile;
  readonly title: string;
  readonly notes?: string;
  readonly objectiveId?: string;
  readonly planId?: string;
  readonly dependencyIds?: readonly string[];
  readonly responsibleItemId?: string;
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly recurrence?: string;
  readonly progress?: { readonly current: number; readonly target: number; readonly unit?: string };
  readonly unresolved?: readonly string[];
  readonly evidence: readonly Evidence[];
}

export interface PlanningCommands {
  create(input: CreatePlanningItemInput): Promise<string>;
  transition(itemId: string, status: string, evidence: readonly Evidence[]): Promise<void>;
  schedule(
    itemId: string,
    temporal: { readonly startAt?: string; readonly dueAt?: string; readonly recurrence?: string },
    evidence: readonly Evidence[],
  ): Promise<void>;
  assign(itemId: string, responsibleItemId: string, evidence: readonly Evidence[]): Promise<void>;
  relate(
    itemId: string,
    relation: {
      readonly objectiveId?: string;
      readonly planId?: string;
      readonly dependencyIds?: readonly string[];
    },
    evidence: readonly Evidence[],
  ): Promise<void>;
  measure(
    itemId: string,
    progress: { readonly current: number; readonly target: number; readonly unit?: string },
    evidence: readonly Evidence[],
  ): Promise<void>;
}

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Writes planning semantics as immutable Item and Component revisions. */
export class PlanningCommandService implements PlanningCommands {
  constructor(
    private readonly knowledge: ItemStore,
    private readonly states: StateWriter,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async create(input: CreatePlanningItemInput): Promise<string> {
    if (!planningProfiles.includes(input.profile))
      throw new InvalidInputError(`Planning Profile ${input.profile} is invalid`);
    const now = this.clock.now().toISOString();
    const item = Item.create({
      id: this.ids.generate(),
      createdAt: now,
      profile: { key: input.profile, version: 1 },
    });
    const revisions = [
      this.revision(
        item.id,
        'descriptive',
        compact({ title: input.title, notes: input.notes }) as ComponentValue,
        input.evidence,
      ),
      this.revision(
        item.id,
        'lifecycle',
        {
          status: initialStatus(input.profile),
          transitions: [{ to: initialStatus(input.profile), at: now }],
        },
        input.evidence,
      ),
    ];
    if (input.profile === 'objective')
      revisions.push(
        this.revision(
          item.id,
          'progress',
          input.progress ?? { current: 0, target: 1 },
          input.evidence,
        ),
      );
    else revisions.push(this.revision(item.id, 'planning', planningValue(input), input.evidence));
    if (input.startAt || input.dueAt || input.recurrence)
      revisions.push(this.revision(item.id, 'temporal', temporalValue(input), input.evidence));
    if (input.responsibleItemId)
      revisions.push(
        this.revision(
          item.id,
          'assignment',
          { responsible: itemReference(input.responsibleItemId) },
          input.evidence,
        ),
      );
    if (input.unresolved?.length)
      revisions.push(this.revision(item.id, 'unresolved', [...input.unresolved], input.evidence));
    await this.validateReferences(
      item.id,
      input.objectiveId,
      input.planId,
      input.dependencyIds,
      input.responsibleItemId,
    );
    await this.knowledge.saveItems({ items: [item], revisions });
    if (input.profile === 'objective')
      await this.states.execute(desiredObjective(item.id, input.evidence));
    return item.id;
  }

  async transition(itemId: string, status: string, evidence: readonly Evidence[]): Promise<void> {
    const { item, current } = await this.requirePlanningItem(itemId);
    const revision = requireComponent(current, 'lifecycle');
    const lifecycle = revision.value as unknown as LifecycleValue;
    const value = transitionLifecycle(
      item.profile?.key as PlanningProfile,
      lifecycle,
      status,
      this.clock.now().toISOString(),
    );
    await this.knowledge.saveItems({
      items: [],
      revisions: [
        this.revision(
          itemId,
          'lifecycle',
          value as unknown as ComponentValue,
          evidence,
          revision.id,
        ),
      ],
    });
  }

  async schedule(
    itemId: string,
    temporal: { readonly startAt?: string; readonly dueAt?: string; readonly recurrence?: string },
    evidence: readonly Evidence[],
  ): Promise<void> {
    await this.replace(itemId, 'temporal', temporalValue(temporal), evidence);
  }
  async assign(
    itemId: string,
    responsibleItemId: string,
    evidence: readonly Evidence[],
  ): Promise<void> {
    await this.validateReferences(itemId, undefined, undefined, undefined, responsibleItemId);
    await this.replace(
      itemId,
      'assignment',
      { responsible: itemReference(responsibleItemId) },
      evidence,
    );
  }
  async relate(
    itemId: string,
    relation: {
      readonly objectiveId?: string;
      readonly planId?: string;
      readonly dependencyIds?: readonly string[];
    },
    evidence: readonly Evidence[],
  ): Promise<void> {
    await this.validateReferences(
      itemId,
      relation.objectiveId,
      relation.planId,
      relation.dependencyIds,
    );
    await this.assertAcyclic(itemId, relation.dependencyIds ?? []);
    await this.replace(itemId, 'planning', planningValue(relation), evidence);
  }
  async measure(
    itemId: string,
    progress: { readonly current: number; readonly target: number; readonly unit?: string },
    evidence: readonly Evidence[],
  ): Promise<void> {
    await this.replace(itemId, 'progress', progress, evidence);
  }

  private revision(
    itemId: string,
    key: string,
    value: ComponentValue,
    evidence: readonly Evidence[],
    supersedesRevisionId?: string,
  ): ComponentRevision {
    return ComponentRevision.create({
      id: this.ids.generate(),
      itemId,
      key,
      schemaVersion: 1,
      value: compact(value),
      evidence,
      recordedAt: this.clock.now().toISOString(),
      supersedesRevisionId,
    });
  }
  private async replace(
    itemId: string,
    key: string,
    value: ComponentValue,
    evidence: readonly Evidence[],
  ): Promise<void> {
    const { current } = await this.requirePlanningItem(itemId);
    const previous = current.find((revision) => revision.key === key);
    await this.knowledge.saveItems({
      items: [],
      revisions: [this.revision(itemId, key, value, evidence, previous?.id)],
    });
  }
  private async requirePlanningItem(itemId: string) {
    const snapshot = await this.knowledge.loadKnowledge();
    const item = snapshot.items.find((candidate) => candidate.id === itemId);
    if (!item || !planningProfiles.includes(item.profile?.key as PlanningProfile))
      throw new NotFoundError(`Planning Item ${itemId} does not exist`);
    return {
      item,
      current: selectCurrentRevisions(
        snapshot.revisions.filter((revision) => revision.itemId === itemId),
      ),
    };
  }
  private async validateReferences(
    itemId: string,
    objectiveId?: string,
    planId?: string,
    dependencies?: readonly string[],
    responsibleId?: string,
  ): Promise<void> {
    const snapshot = await this.knowledge.loadKnowledge();
    const requireProfile = (id: string | undefined, profile?: PlanningProfile) => {
      if (!id) return;
      const target = snapshot.items.find((item) => item.id === id);
      if (!target || (profile && target.profile?.key !== profile))
        throw new InvalidInputError(
          `Referenced ${profile ?? 'responsible'} Item ${id} does not exist`,
        );
    };
    requireProfile(objectiveId, 'objective');
    requireProfile(planId, 'plan');
    requireProfile(responsibleId);
    for (const dependency of dependencies ?? []) {
      if (dependency === itemId)
        throw new InvalidInputError('A planning Item cannot depend on itself');
      requireProfile(dependency);
    }
  }
  private async assertAcyclic(itemId: string, dependencies: readonly string[]): Promise<void> {
    const snapshot = await this.knowledge.loadKnowledge();
    const current = selectCurrentRevisions(snapshot.revisions);
    const graph = new Map<string, readonly string[]>();
    for (const item of snapshot.items)
      graph.set(
        item.id,
        dependencyIds(
          current.find((revision) => revision.itemId === item.id && revision.key === 'planning')
            ?.value,
        ),
      );
    graph.set(itemId, dependencies);
    const visit = (id: string, path: Set<string>): void => {
      if (path.has(id)) throw new InvalidInputError('Planning dependencies cannot form a cycle');
      const next = new Set(path);
      next.add(id);
      for (const dependency of graph.get(id) ?? []) visit(dependency, next);
    };
    visit(itemId, new Set());
  }
}

function requireComponent(revisions: readonly ComponentRevision[], key: string): ComponentRevision {
  const revision = revisions.find((candidate) => candidate.key === key);
  if (!revision) throw new InvalidInputError(`Component ${key} does not exist`);
  return revision;
}
function planningValue(input: {
  readonly objectiveId?: string;
  readonly planId?: string;
  readonly dependencyIds?: readonly string[];
}): ComponentValue {
  return compact({
    objective: input.objectiveId
      ? itemReference(input.objectiveId, { key: 'objective', version: 1 })
      : undefined,
    plan: input.planId ? itemReference(input.planId, { key: 'plan', version: 1 }) : undefined,
    dependencies: input.dependencyIds?.map((id) => itemReference(id)) ?? [],
  }) as ComponentValue;
}
function temporalValue(input: {
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly recurrence?: string;
}): ComponentValue {
  for (const value of [input.startAt, input.dueAt])
    if (value && Number.isNaN(Date.parse(value)))
      throw new InvalidInputError('Planning dates must be valid date-times');
  return compact({
    startAt: input.startAt,
    dueAt: input.dueAt,
    recurrence: input.recurrence,
  }) as ComponentValue;
}
function dependencyIds(value?: ComponentValue): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const dependencies = (value as Readonly<Record<string, ComponentValue>>).dependencies;
  return Array.isArray(dependencies)
    ? dependencies.flatMap((reference) =>
        reference &&
        typeof reference === 'object' &&
        !Array.isArray(reference) &&
        typeof (reference as { readonly itemId?: unknown }).itemId === 'string'
          ? [(reference as { readonly itemId: string }).itemId]
          : [],
      )
    : [];
}
function desiredObjective(itemId: string, evidence: readonly Evidence[]): PersistStateInput {
  const condition: Condition = {
    operator: { key: 'equal', version: 1 },
    operands: [
      { kind: 'component', itemId, key: 'lifecycle', field: 'status' },
      { kind: 'literal', value: 'achieved' },
    ],
  };
  return { modality: 'desired', condition, author: { kind: 'user' }, evidence };
}
function compact<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map(compact) as Value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, compact(child)]),
    ) as Value;
  return value;
}
