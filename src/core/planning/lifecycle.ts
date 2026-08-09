import { DomainError } from '../error.js';
import type { Profile } from '../item/types.js';

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

export function initialStatus(profile: Profile): string {
  if (!profile.lifecycle) throw new DomainError(`Profile ${profile.key} has no lifecycle`);
  return profile.lifecycle.initial;
}

export function transitionLifecycle(
  profile: Profile,
  lifecycle: LifecycleValue,
  to: string,
  at: string,
): LifecycleValue {
  if (!profile.lifecycle?.transitions[lifecycle.status]?.includes(to)) {
    throw new DomainError(`${profile.key} cannot transition from ${lifecycle.status} to ${to}`);
  }
  return Object.freeze({
    status: to,
    transitions: Object.freeze([
      ...lifecycle.transitions,
      Object.freeze({ from: lifecycle.status, to, at }),
    ]),
  });
}
