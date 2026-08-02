import { DomainError } from '../error.js';

export const planningProfiles = ['task', 'objective', 'plan', 'habit'] as const;
export type PlanningProfile = (typeof planningProfiles)[number];

export interface LifecycleTransition {
  readonly from?: string;
  readonly to: string;
  readonly at: string;
}

export interface LifecycleValue {
  readonly status: string;
  readonly transitions: readonly LifecycleTransition[];
}

const transitions: Readonly<Record<PlanningProfile, Readonly<Record<string, readonly string[]>>>> =
  {
    task: {
      pending: ['inProgress', 'completed', 'cancelled'],
      inProgress: ['pending', 'completed', 'cancelled'],
      completed: ['pending'],
      cancelled: ['pending'],
    },
    objective: { active: ['achieved', 'abandoned'], achieved: ['active'], abandoned: ['active'] },
    plan: {
      draft: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: ['active'],
      cancelled: ['draft'],
    },
    habit: { active: ['paused', 'retired'], paused: ['active', 'retired'], retired: ['active'] },
  };

export function initialStatus(profile: PlanningProfile): string {
  return { task: 'pending', objective: 'active', plan: 'draft', habit: 'active' }[profile];
}

export function transitionLifecycle(
  profile: PlanningProfile,
  lifecycle: LifecycleValue,
  to: string,
  at: string,
): LifecycleValue {
  if (!transitions[profile][lifecycle.status]?.includes(to)) {
    throw new DomainError(`${profile} cannot transition from ${lifecycle.status} to ${to}`);
  }
  return Object.freeze({
    status: to,
    transitions: Object.freeze([
      ...lifecycle.transitions,
      Object.freeze({ from: lifecycle.status, to, at }),
    ]),
  });
}
