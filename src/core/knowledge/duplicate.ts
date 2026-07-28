import type { Axiom } from './axiom.js';
import type { Link } from './link.js';

export function findDuplicateAxiom(axioms: Iterable<Axiom>, axiom: Axiom): Axiom | undefined {
  const signature = axiomSignature(axiom);

  return [...axioms].find((candidate) => axiomSignature(candidate) === signature);
}

export function findDuplicateLink(links: Iterable<Link>, link: Link): Link | undefined {
  const signature = linkSignature(link);

  return [...links].find((candidate) => linkSignature(candidate) === signature);
}

function axiomSignature(axiom: Axiom): string {
  return JSON.stringify({
    entryId: axiom.entryId,
    subjectConceptId: axiom.subjectConceptId,
    predicateId: axiom.predicateId,
    object: objectSignature(axiom),
    sourceLocators: axiom.sourceLocators,
  });
}

function linkSignature(link: Link): string {
  return JSON.stringify({
    sourceAxiomId: link.sourceAxiomId,
    predicateId: link.predicateId,
    targetAxiomId: link.targetAxiomId,
    provenance: provenanceSignature(link),
  });
}

function objectSignature(axiom: Axiom): object {
  if (axiom.object.kind === 'concept') {
    return {
      kind: 'concept',
      conceptId: axiom.object.conceptId,
    };
  }

  return {
    kind: 'literal',
    literal: {
      kind: axiom.object.literal.kind,
      value: axiom.object.literal.value,
    },
  };
}

function provenanceSignature(link: Link): object {
  if (link.provenance.kind === 'entry') {
    return {
      kind: 'entry',
      entryId: link.provenance.entryId,
      sourceLocators: link.provenance.sourceLocators,
    };
  }

  return {
    kind: 'inference',
    evidenceAxiomIds: link.provenance.evidenceAxiomIds,
  };
}
