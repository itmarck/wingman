import { DomainError } from '../error.js';
import { assertText, normalizeText } from './guard.js';

export type PredicateId = string;
export type PredicateOrigin = 'custom' | 'system';
export type PredicateScope = 'axiom' | 'both' | 'link';
export type PredicateMode = 'descriptive' | 'operational';

export const systemSupersedesKey = 'system.supersedes';

const predicateKeyPattern = /^[a-z][A-Za-z0-9]*$/;
const systemPredicateKeyPattern = /^system\.[a-z][A-Za-z0-9]*$/;
const reservedNames = ['supersedes'];
const operationalPredicates = [systemSupersedesKey];

export interface CreatePredicateInput {
  readonly id: PredicateId;
  readonly key: string;
  readonly definition: string;
  readonly origin: PredicateOrigin;
  readonly scope: PredicateScope;
  readonly mode?: PredicateMode;
}

/**
 * Extensible meaning used by an Axiom or Link.
 */
export class Predicate {
  readonly id: PredicateId;
  readonly key: string;
  readonly definition: string;
  readonly origin: PredicateOrigin;
  readonly scope: PredicateScope;
  readonly mode: PredicateMode;

  private constructor(input: CreatePredicateInput) {
    this.id = input.id;
    this.key = input.key;
    this.definition = input.definition.trim();
    this.origin = input.origin;
    this.scope = input.scope;
    this.mode = input.mode ?? 'descriptive';

    Object.freeze(this);
  }

  /**
   * Creates a Predicate and protects system-owned operational semantics.
   */
  static create(input: CreatePredicateInput): Predicate {
    assertText(input.id, 'Predicate id');
    assertText(input.definition, 'Predicate definition');
    assertKey(input.key);
    assertAuthority(input);

    return new Predicate(input);
  }

  /**
   * Reconstructs a Predicate from persisted canonical data.
   */
  static rehydrate(input: CreatePredicateInput): Predicate {
    return Predicate.create(input);
  }

  /**
   * Reports whether this Predicate can participate in the requested structure.
   */
  supports(target: Exclude<PredicateScope, 'both'>): boolean {
    return this.scope === 'both' || this.scope === target;
  }

  /**
   * Checks the canonical definition without attempting semantic inference.
   */
  hasDefinition(value: string): boolean {
    return normalizeText(this.definition) === normalizeText(value);
  }
}

function assertKey(key: string): void {
  if (!predicateKeyPattern.test(key) && !systemPredicateKeyPattern.test(key)) {
    throw new DomainError('Predicate key must use camelCase or system.camelCase');
  }
}

function assertAuthority(input: CreatePredicateInput): void {
  const segments = input.key.split('.');
  const namespace = segments[0];
  const name = segments.at(-1) ?? '';
  const usesSystemNamespace = namespace === 'system';
  const usesReservedName = reservedNames.includes(name);
  const createsReservedCustomPredicate = input.origin === 'custom' && usesReservedName;

  if (createsReservedCustomPredicate) {
    throw new DomainError(`Predicate ${name} is reserved by the system`);
  }

  if (usesSystemNamespace && input.origin !== 'system') {
    throw new DomainError('Predicate system namespace is reserved');
  }

  if (!usesSystemNamespace && input.origin === 'system') {
    throw new DomainError('System Predicate must use the system namespace');
  }

  if (input.mode === 'operational' && !usesSystemNamespace) {
    throw new DomainError('Operational Predicate must use the system namespace');
  }

  const isOperational = input.mode === 'operational';
  const isKnownOperationalPredicate = operationalPredicates.includes(input.key);

  if (isOperational && !isKnownOperationalPredicate) {
    throw new DomainError(`Predicate ${input.key} has no known operational behavior`);
  }

  if (input.key === systemSupersedesKey) {
    const hasSupersedesContract =
      input.origin === 'system' && input.scope === 'link' && input.mode === 'operational';

    if (!hasSupersedesContract) {
      throw new DomainError('Predicate system.supersedes must be an operational Link Predicate');
    }
  }
}
