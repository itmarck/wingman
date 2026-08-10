import type { ComponentRevision } from '../../../core/item/component.js';
import { itemReference, selectCurrentRevisions } from '../../../core/item/registry.js';
import type { ComponentValue, Evidence, Profile } from '../../../core/item/types.js';
import type { PlanningProfile } from '../../../core/planning/lifecycle.js';
import { InvalidInputError } from '../../../system/error.js';
import type { ItemStore } from '../../knowledge/ports/store.js';
import type { PersistStateInput } from '../../state/operations/create.js';

export async function validatePlanningReferences(
  knowledge: ItemStore,
  itemId: string,
  objectiveId?: string,
  planId?: string,
  dependencies?: readonly string[],
  responsibleId?: string,
): Promise<void> {
  const snapshot = await knowledge.loadKnowledge();
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

export async function assertAcyclicDependencies(
  knowledge: ItemStore,
  itemId: string,
  dependencies: readonly string[],
): Promise<void> {
  const snapshot = await knowledge.loadKnowledge();
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

export function requireComponent(
  revisions: readonly ComponentRevision[],
  key: string,
): ComponentRevision {
  const revision = revisions.find((candidate) => candidate.key === key);
  if (!revision) throw new InvalidInputError(`Component ${key} does not exist`);
  return revision;
}

export function planningValue(input: {
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

export function temporalValue(input: {
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly recurrence?: string;
}): ComponentValue {
  for (const value of [input.startAt, input.dueAt])
    if (value && Number.isNaN(Date.parse(value)))
      throw new InvalidInputError('Planning dates must be valid date-times');
  return compact(input) as ComponentValue;
}

export function profileState(
  itemId: string,
  template: NonNullable<Profile['states']>[number],
  evidence: readonly Evidence[],
): PersistStateInput {
  return {
    modality: template.modality,
    condition: {
      operator: template.operator,
      operands: [
        { kind: 'component', itemId, key: template.component.key, field: template.component.field },
        { kind: 'literal', value: template.value },
      ],
    },
    author: { kind: 'user' },
    evidence,
  };
}

export function compact<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map(compact) as Value;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, compact(child)]),
    ) as Value;
  return value;
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
