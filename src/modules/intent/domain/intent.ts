import { DomainError } from '../../../core/error.js';
import type { AxiomId } from '../../../core/knowledge/axiom.js';
import type { EntryId } from '../../../core/knowledge/entry.js';
import { assertDate, assertText } from '../../../core/knowledge/guard.js';

export type IntentId = string;

export interface CreateIntentInput {
  readonly id: IntentId;
  readonly key: string;
  readonly entryId: EntryId;
  readonly axiomIds?: readonly AxiomId[];
  readonly scheduledFor?: string;
}

const intentKeyPattern = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;

/**
 * Immutable proposal to perform an action. Authorization and execution are separate concerns.
 */
export class Intent {
  readonly id: IntentId;
  readonly key: string;
  readonly entryId: EntryId;
  readonly axiomIds: readonly AxiomId[];
  readonly scheduledFor?: string;

  private constructor(input: CreateIntentInput) {
    this.id = input.id;
    this.key = input.key;
    this.entryId = input.entryId;
    this.axiomIds = Object.freeze([...(input.axiomIds ?? [])]);
    this.scheduledFor = input.scheduledFor;

    Object.freeze(this);
  }

  /**
   * Creates an Intent without authorizing or executing it.
   */
  static create(input: CreateIntentInput): Intent {
    assertText(input.id, 'Intent id');
    assertText(input.entryId, 'Intent entryId');

    if (!intentKeyPattern.test(input.key)) {
      throw new DomainError('Intent key must use namespaced camelCase segments');
    }

    for (const axiomId of input.axiomIds ?? []) {
      assertText(axiomId, 'Intent axiomId');
    }

    if (input.scheduledFor !== undefined) {
      assertDate(input.scheduledFor, 'Intent scheduledFor');
    }

    return new Intent(input);
  }
}
