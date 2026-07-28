import { DomainError } from '../error.js';
import type { Predicate } from './predicate.js';

export type PredicateTarget = 'axiom' | 'link';

/** Enforces whether a Predicate can participate in a domain structure. */
export function assertPredicateTarget(predicate: Predicate, target: PredicateTarget): void {
  if (!predicate.supports(target)) {
    const name = `${target[0].toUpperCase()}${target.slice(1)}`;
    const article = target === 'axiom' ? 'an' : 'a';

    throw new DomainError(`Predicate ${predicate.key} cannot be used by ${article} ${name}`);
  }
}
