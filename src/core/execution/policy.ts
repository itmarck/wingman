import { DomainError } from '../error.js';

export const autonomyLevels = ['blocked', 'propose', 'execute'] as const;
export type AutonomyLevel = (typeof autonomyLevels)[number];

export interface AutonomyPolicy {
  readonly global: AutonomyLevel;
  readonly capability?: AutonomyLevel;
  readonly user?: AutonomyLevel;
  readonly explicitlyConsented?: boolean;
  readonly safetyCeiling: AutonomyLevel;
}

/** Resolves authority from broad policy and granted consent without exceeding safety. */
export function resolveAutonomy(policy: AutonomyPolicy): AutonomyLevel {
  for (const level of [policy.global, policy.capability, policy.user, policy.safetyCeiling]) {
    if (level !== undefined && !autonomyLevels.includes(level))
      throw new DomainError(`Autonomy level ${level} is invalid`);
  }
  const rank = (level: AutonomyLevel) => autonomyLevels.indexOf(level);
  const configured = [policy.global, policy.capability, policy.user]
    .filter((value): value is AutonomyLevel => value !== undefined)
    .reduce((authority, value) => (rank(value) < rank(authority) ? value : authority), 'execute');
  const consented = policy.explicitlyConsented && configured === 'propose' ? 'execute' : configured;
  return rank(consented) > rank(policy.safetyCeiling) ? policy.safetyCeiling : consented;
}
