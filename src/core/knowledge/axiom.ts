import { DomainError } from '../error.js';
import type { ConceptId } from './concept.js';
import type { EntryId } from './entry.js';
import { assertDateOnly, assertText, assertUtcDateTime } from './guard.js';
import type { PredicateId } from './predicate.js';
import { normalizeSourceLocators, type SourceLocator } from './source.js';

export type { SourceLocator } from './source.js';

export type AxiomId = string;

export type Literal =
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'dateTime'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'url'; readonly value: string };

export type AxiomObject =
  | { readonly kind: 'concept'; readonly conceptId: ConceptId }
  | { readonly kind: 'literal'; readonly literal: Literal };

export interface CreateAxiomInput {
  readonly id: AxiomId;
  readonly entryId: EntryId;
  readonly subjectConceptId: ConceptId;
  readonly predicateId: PredicateId;
  readonly object: AxiomObject;
  readonly sourceLocators?: readonly SourceLocator[];
}

/**
 * Immutable unit of structured knowledge supported by exactly one Entry.
 */
export class Axiom {
  readonly id: AxiomId;
  readonly entryId: EntryId;
  readonly subjectConceptId: ConceptId;
  readonly predicateId: PredicateId;
  readonly object: AxiomObject;
  readonly sourceLocators: readonly SourceLocator[];

  private constructor(input: CreateAxiomInput) {
    this.id = input.id;
    this.entryId = input.entryId;
    this.subjectConceptId = input.subjectConceptId;
    this.predicateId = input.predicateId;
    this.object = freezeObject(input.object);
    this.sourceLocators = normalizeSourceLocators(input.sourceLocators);

    Object.freeze(this);
  }

  /**
   * Creates an Axiom after validating its structure and provenance values.
   */
  static create(input: CreateAxiomInput): Axiom {
    assertText(input.id, 'Axiom id');
    assertText(input.entryId, 'Axiom entryId');
    assertText(input.subjectConceptId, 'Axiom subjectConceptId');
    assertText(input.predicateId, 'Axiom predicateId');
    assertObject(input.object);

    return new Axiom(input);
  }

  /**
   * Reconstructs an Axiom and its provenance from persistence.
   */
  static rehydrate(input: CreateAxiomInput): Axiom {
    return Axiom.create(input);
  }
}

function assertObject(object: AxiomObject): void {
  if (object.kind === 'concept') {
    assertText(object.conceptId, 'Axiom object conceptId');
    return;
  }

  const { kind, value } = object.literal;
  const isBlankString = typeof value === 'string' && value.trim().length === 0;
  const isInvalidNumber = kind === 'number' && !Number.isFinite(value);

  if (isBlankString) {
    throw new DomainError(`Axiom ${kind} literal cannot be empty`);
  }

  if (isInvalidNumber) {
    throw new DomainError('Axiom number literal must be finite');
  }

  if (kind === 'date') {
    assertDateOnly(value, 'Axiom date literal');
  }

  if (kind === 'dateTime') {
    assertUtcDateTime(value, 'Axiom dateTime literal');
  }

  if (kind === 'url') {
    assertUrl(value);
  }
}

function freezeObject(object: AxiomObject): AxiomObject {
  if (object.kind === 'concept') {
    return Object.freeze({ ...object });
  }

  return Object.freeze({
    ...object,
    literal: Object.freeze({ ...object.literal }),
  });
}

function assertUrl(value: string): void {
  try {
    new URL(value);
  } catch {
    throw new DomainError('Axiom url literal must be valid');
  }
}
