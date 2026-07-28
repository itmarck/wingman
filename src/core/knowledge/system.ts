import { Predicate } from './predicate.js';

/**
 * Returns the fixed operational vocabulary understood by the system.
 */
export function createSystemPredicates(): readonly Predicate[] {
  return Object.freeze([
    Predicate.create({
      id: 'system.supersedes',
      key: 'system.supersedes',
      definition: 'The source Axiom replaces the target Axiom as current knowledge',
      origin: 'system',
      scope: 'link',
      mode: 'operational',
    }),
  ]);
}
