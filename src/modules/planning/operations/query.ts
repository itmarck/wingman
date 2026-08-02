import { selectCurrentRevisions } from '../../../core/item/registry.js';
import type { ComponentValue } from '../../../core/item/types.js';
import type { LifecycleTransition, PlanningProfile } from '../../../core/planning/lifecycle.js';
import type { ItemStore } from '../../knowledge/ports/store.js';

export const planningViews = [
  'pending',
  'blocked',
  'overdue',
  'unscheduled',
  'actionable',
  'completed',
  'progress',
] as const;
export type PlanningView = (typeof planningViews)[number];

export interface PlanningRecord {
  readonly itemId: string;
  readonly profile: PlanningProfile;
  readonly title: string;
  readonly status: string;
  readonly objectiveId?: string;
  readonly dueAt?: string;
  readonly blockerIds: readonly string[];
  readonly progress?: number;
  readonly hasActionableNextStep?: boolean;
  readonly unresolved: readonly string[];
}

export interface PlanningQueries {
  list(view: PlanningView): Promise<readonly PlanningRecord[]>;
  history(itemId: string): Promise<readonly LifecycleTransition[]>;
}

/** Derives useful planning views without changing knowledge or causing effects. */
export class PlanningQueryService implements PlanningQueries {
  constructor(
    private readonly knowledge: ItemStore,
    private readonly now: () => Date,
  ) {}

  async list(view: PlanningView): Promise<readonly PlanningRecord[]> {
    const snapshot = await this.knowledge.loadKnowledge();
    const current = selectCurrentRevisions(snapshot.revisions);
    const records = snapshot.items.flatMap((item): PlanningRecord[] => {
      if (!item.profile || !['task', 'objective', 'plan', 'habit'].includes(item.profile.key))
        return [];
      const value = (key: string) =>
        current.find((revision) => revision.itemId === item.id && revision.key === key)?.value;
      const lifecycle = record(value('lifecycle'));
      const descriptive = record(value('descriptive'));
      const planning = record(value('planning'));
      const temporal = record(value('temporal'));
      const dependencies = references(planning?.dependencies);
      const blockers = dependencies.filter((id) => {
        const status = record(
          current.find((revision) => revision.itemId === id && revision.key === 'lifecycle')?.value,
        )?.status;
        return !isCompleted(status);
      });
      const progress = record(value('progress'));
      const unresolved = value('unresolved');
      return [
        {
          itemId: item.id,
          profile: item.profile.key as PlanningProfile,
          title: typeof descriptive?.title === 'string' ? descriptive.title : item.id,
          status: typeof lifecycle?.status === 'string' ? lifecycle.status : 'unknown',
          objectiveId: reference(planning?.objective),
          dueAt: typeof temporal?.dueAt === 'string' ? temporal.dueAt : undefined,
          blockerIds: Object.freeze(blockers),
          progress:
            progress && typeof progress.current === 'number' && typeof progress.target === 'number'
              ? Math.max(0, Math.min(1, progress.current / progress.target))
              : undefined,
          unresolved: Object.freeze(
            Array.isArray(unresolved)
              ? unresolved.filter((item): item is string => typeof item === 'string')
              : [],
          ),
        },
      ];
    });
    const completed = (item: PlanningRecord) => isCompleted(item.status);
    const pending = (item: PlanningRecord) =>
      !completed(item) && !['cancelled', 'abandoned', 'retired'].includes(item.status);
    const enriched = records.map((item) =>
      item.profile === 'objective'
        ? {
            ...item,
            hasActionableNextStep: records.some(
              (candidate) =>
                candidate.profile === 'task' &&
                candidate.objectiveId === item.itemId &&
                !isCompleted(candidate.status) &&
                candidate.blockerIds.length === 0,
            ),
          }
        : item,
    );
    const filtered = enriched.filter((item) => {
      if (view === 'pending') return pending(item);
      if (view === 'blocked') return pending(item) && item.blockerIds.length > 0;
      if (view === 'overdue')
        return (
          pending(item) && Boolean(item.dueAt && Date.parse(item.dueAt) < this.now().getTime())
        );
      if (view === 'unscheduled') return item.profile === 'task' && pending(item) && !item.dueAt;
      if (view === 'actionable')
        return item.profile === 'task' && pending(item) && item.blockerIds.length === 0;
      if (view === 'completed') return completed(item);
      return item.profile === 'objective';
    });
    return Object.freeze(filtered.map((item) => Object.freeze(item)));
  }

  async history(itemId: string): Promise<readonly LifecycleTransition[]> {
    const snapshot = await this.knowledge.loadKnowledge();
    const current = selectCurrentRevisions(snapshot.revisions);
    const lifecycle = record(
      current.find((revision) => revision.itemId === itemId && revision.key === 'lifecycle')?.value,
    );
    return Object.freeze(
      Array.isArray(lifecycle?.transitions)
        ? lifecycle.transitions.map((value) =>
            Object.freeze(value as unknown as LifecycleTransition),
          )
        : [],
    );
  }
}

function record(value?: ComponentValue): Readonly<Record<string, ComponentValue>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, ComponentValue>>)
    : undefined;
}
function reference(value?: ComponentValue): string | undefined {
  return record(value)?.kind === 'itemReference' && typeof record(value)?.itemId === 'string'
    ? (record(value)?.itemId as string)
    : undefined;
}
function references(value?: ComponentValue): readonly string[] {
  return Array.isArray(value) ? value.flatMap((entry) => reference(entry) ?? []) : [];
}
function isCompleted(status?: ComponentValue): boolean {
  return typeof status === 'string' && ['completed', 'achieved'].includes(status);
}
