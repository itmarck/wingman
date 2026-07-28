import { DomainError } from '../error.js';
import type { Axiom } from './axiom.js';
import type { Link } from './link.js';
import { type Predicate, systemSupersedesKey } from './predicate.js';

/** Derives current Axioms while preserving superseded history. */
export function deriveCurrentAxioms(
  axioms: Iterable<Axiom>,
  links: Iterable<Link>,
  predicates: Iterable<Predicate>,
): readonly Axiom[] {
  const predicateList = [...predicates];
  const linkList = [...links];

  assertValidSupersedesGraph(linkList, predicateList);

  const supersedesIds = findSupersedesIds(predicateList);
  const supersededIds = new Set(
    linkList
      .filter((link) => supersedesIds.has(link.predicateId))
      .map((link) => link.targetAxiomId),
  );

  return Object.freeze([...axioms].filter((axiom) => !supersededIds.has(axiom.id)));
}

/**
 * Prevents operational replacement history from pointing to itself or forming cycles.
 */
export function assertValidSupersedesGraph(
  links: Iterable<Link>,
  predicates: Iterable<Predicate>,
): void {
  const supersedesIds = findSupersedesIds(predicates);
  const replacements = new Map<string, Set<string>>();

  for (const link of links) {
    if (!supersedesIds.has(link.predicateId)) {
      continue;
    }

    if (link.sourceAxiomId === link.targetAxiomId) {
      throw new DomainError('An Axiom cannot supersede itself');
    }

    const targets = replacements.get(link.sourceAxiomId) ?? new Set<string>();

    targets.add(link.targetAxiomId);
    replacements.set(link.sourceAxiomId, targets);
  }

  assertAcyclic(replacements);
}

function findSupersedesIds(predicates: Iterable<Predicate>): ReadonlySet<string> {
  return new Set(
    [...predicates]
      .filter(
        (predicate) =>
          predicate.key === systemSupersedesKey &&
          predicate.mode === 'operational' &&
          predicate.supports('link'),
      )
      .map((predicate) => predicate.id),
  );
}

function assertAcyclic(replacements: ReadonlyMap<string, ReadonlySet<string>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (axiomId: string): void => {
    if (visiting.has(axiomId)) {
      throw new DomainError('system.supersedes cannot form a cycle');
    }

    if (visited.has(axiomId)) {
      return;
    }

    visiting.add(axiomId);

    for (const targetId of replacements.get(axiomId) ?? []) {
      visit(targetId);
    }

    visiting.delete(axiomId);
    visited.add(axiomId);
  };

  for (const axiomId of replacements.keys()) {
    visit(axiomId);
  }
}
