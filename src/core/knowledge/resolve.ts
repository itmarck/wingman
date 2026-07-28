import type { Concept } from './concept.js';

export type ConceptResolutionStatus = 'ambiguous' | 'matched' | 'missing';

export interface ConceptResolution {
  readonly status: ConceptResolutionStatus;
  readonly candidates: readonly Concept[];
}

/**
 * Resolves normalized names and exact definitions without making semantic guesses.
 */
export function resolveConcept(
  concepts: Iterable<Concept>,
  name: string,
  definition?: string,
): ConceptResolution {
  const namedCandidates = [...concepts].filter((concept) => concept.matches(name));

  if (namedCandidates.length === 0) {
    return createResolution('missing', []);
  }

  const hasDefinition = definition !== undefined && definition.trim().length > 0;

  if (!hasDefinition) {
    return resolveCandidates(namedCandidates);
  }

  const definedCandidates = namedCandidates.filter((concept) => concept.hasDefinition(definition));

  if (definedCandidates.length === 0) {
    return createResolution('ambiguous', namedCandidates);
  }

  return resolveCandidates(definedCandidates);
}

function resolveCandidates(candidates: readonly Concept[]): ConceptResolution {
  const status = candidates.length === 1 ? 'matched' : 'ambiguous';

  return createResolution(status, candidates);
}

function createResolution(
  status: ConceptResolutionStatus,
  candidates: readonly Concept[],
): ConceptResolution {
  return Object.freeze({
    status,
    candidates: Object.freeze([...candidates]),
  });
}
