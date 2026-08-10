import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import type { SchemaRegistry } from '../../../core/item/registry.js';
import { itemReference, selectCurrentRevisions } from '../../../core/item/registry.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';
import {
  initialStatus,
  type LifecycleValue,
  type PlanningProfile,
  planningProfiles,
  transitionLifecycle,
} from '../../../core/planning/lifecycle.js';
import { InvalidInputError, NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ItemStore } from '../../knowledge/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';
import {
  assertAcyclicDependencies,
  compact,
  planningValue,
  profileState,
  requireComponent,
  temporalValue,
  validatePlanningReferences,
} from './rules.js';

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
    private readonly registry: SchemaRegistry,
  ) {}

  async create(input: CreatePlanningItemInput): Promise<string> {
    if (!planningProfiles.includes(input.profile))
      throw new InvalidInputError(`Planning Profile ${input.profile} is invalid`);
    const profile = this.registry.requireProfile(input.profile, 1);
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
          status: initialStatus(profile),
          transitions: [{ to: initialStatus(profile), at: now }],
        },
        input.evidence,
      ),
    ];
    for (const initial of profile.initialComponents ?? []) {
      const supplied =
        initial.key === 'progress' && input.progress
          ? input.progress
          : initial.key === 'planning'
            ? planningValue(input)
            : initial.value;
      revisions.push(this.revision(item.id, initial.key, supplied, input.evidence));
    }
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
    await validatePlanningReferences(
      this.knowledge,
      item.id,
      input.objectiveId,
      input.planId,
      input.dependencyIds,
      input.responsibleItemId,
    );
    await this.knowledge.saveItems({ items: [item], revisions });
    for (const state of profile.states ?? [])
      await this.states.execute(profileState(item.id, state, input.evidence));
    return item.id;
  }

  async transition(itemId: string, status: string, evidence: readonly Evidence[]): Promise<void> {
    const { item, current } = await this.requirePlanningItem(itemId);
    const revision = requireComponent(current, 'lifecycle');
    const lifecycle = revision.value as unknown as LifecycleValue;
    const value = transitionLifecycle(
      this.registry.requireProfile(
        item.profile?.key as PlanningProfile,
        item.profile?.version ?? 1,
      ),
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
    await validatePlanningReferences(
      this.knowledge,
      itemId,
      undefined,
      undefined,
      undefined,
      responsibleItemId,
    );
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
    await validatePlanningReferences(
      this.knowledge,
      itemId,
      relation.objectiveId,
      relation.planId,
      relation.dependencyIds,
    );
    await assertAcyclicDependencies(this.knowledge, itemId, relation.dependencyIds ?? []);
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
}
