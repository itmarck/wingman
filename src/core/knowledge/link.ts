import { DomainError } from '../error.js';
import type { AxiomId } from './axiom.js';
import type { EntryId } from './entry.js';
import { assertText } from './guard.js';
import type { PredicateId } from './predicate.js';
import { normalizeSourceLocators, type SourceLocator } from './source.js';

export type LinkId = string;

export type LinkProvenance =
  | {
      readonly kind: 'entry';
      readonly entryId: EntryId;
      readonly sourceLocators?: readonly SourceLocator[];
    }
  | {
      readonly kind: 'inference';
      readonly evidenceAxiomIds: readonly [AxiomId, ...AxiomId[]];
    };

export interface CreateLinkInput {
  readonly id: LinkId;
  readonly sourceAxiomId: AxiomId;
  readonly predicateId: PredicateId;
  readonly targetAxiomId: AxiomId;
  readonly provenance: LinkProvenance;
}

/**
 * Explainable historical or epistemological connection between two Axioms.
 */
export class Link {
  readonly id: LinkId;
  readonly sourceAxiomId: AxiomId;
  readonly predicateId: PredicateId;
  readonly targetAxiomId: AxiomId;
  readonly provenance: LinkProvenance;

  private constructor(input: CreateLinkInput) {
    this.id = input.id;
    this.sourceAxiomId = input.sourceAxiomId;
    this.predicateId = input.predicateId;
    this.targetAxiomId = input.targetAxiomId;
    this.provenance = freezeProvenance(input.provenance);

    Object.freeze(this);
  }

  /**
   * Creates a Link with explicit provenance.
   */
  static create(input: CreateLinkInput): Link {
    assertText(input.id, 'Link id');
    assertText(input.sourceAxiomId, 'Link sourceAxiomId');
    assertText(input.predicateId, 'Link predicateId');
    assertText(input.targetAxiomId, 'Link targetAxiomId');

    if (input.sourceAxiomId === input.targetAxiomId) {
      throw new DomainError('Link cannot connect an Axiom to itself');
    }

    assertProvenance(input.provenance);

    return new Link(input);
  }

  /**
   * Reconstructs a Link and its provenance from persistence.
   */
  static rehydrate(input: CreateLinkInput): Link {
    return Link.create(input);
  }
}

function assertProvenance(provenance: LinkProvenance): void {
  if (provenance.kind === 'entry') {
    assertText(provenance.entryId, 'Link provenance entryId');
    return;
  }

  if (provenance.evidenceAxiomIds.length === 0) {
    throw new DomainError('Link inference requires at least one evidence Axiom');
  }

  for (const axiomId of provenance.evidenceAxiomIds) {
    assertText(axiomId, 'Link provenance evidenceAxiomId');
  }
}

function freezeProvenance(provenance: LinkProvenance): LinkProvenance {
  if (provenance.kind === 'entry') {
    return Object.freeze({
      ...provenance,
      sourceLocators: normalizeSourceLocators(provenance.sourceLocators),
    });
  }

  const evidenceAxiomIds = [...new Set(provenance.evidenceAxiomIds)].sort();
  const [firstAxiomId, ...remainingAxiomIds] = evidenceAxiomIds;

  return Object.freeze({
    ...provenance,
    evidenceAxiomIds: Object.freeze([firstAxiomId, ...remainingAxiomIds] as const),
  });
}
