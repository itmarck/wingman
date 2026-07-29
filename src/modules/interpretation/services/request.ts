import type { Entry } from '../../../core/knowledge/entry.js';
import type { InterpretationContext } from './context.js';

export const reasoningLevels = ['low', 'high'] as const;

export type ReasoningLevel = (typeof reasoningLevels)[number];

export interface InterpretationRequest {
  readonly operation: 'interpretEntry';
  readonly reasoning: ReasoningLevel;
  readonly instructionsVersion: string;
  readonly objective: string;
  readonly instructions: readonly string[];
  readonly entry: Entry;
  readonly context: InterpretationContext;
  readonly outputContract: string;
}

const instructions = Object.freeze([
  'Preserve the meaning of the Entry without inventing information.',
  'Extract only durable and reusable knowledge.',
  'Reuse relevant Concepts and Predicates from the supplied context when they mean the same thing.',
  'Create a custom Predicate when the context has no suitable Predicate for a durable fact.',
  'List only newly defined custom Predicates in the Draft; reference reused context Predicates directly by key.',
  'Use lower camelCase Predicate keys such as worksAt; do not use spaces, hyphens, underscores, or PascalCase.',
  'Only reuse system.camelCase Predicate keys supplied in the context; never invent system Predicates.',
  'Use references that exist in the Draft or in the supplied context.',
  'Return empty only when the Entry legitimately contains no durable knowledge.',
  'Return invalid when the operation cannot satisfy the output contract.',
]);

const outputContract = `Return exactly one result:
- knowledge: a Draft containing entryId, concepts, predicates, axioms and optional links.
- empty: an explicit valid decision that the Entry contains no durable knowledge.
- invalid: a reason explaining why the contract could not be satisfied.`;

/**
 * Defines the provider-independent instructions and output contract for interpreting an Entry.
 */
export function createInterpretationRequest(
  entry: Entry,
  context: InterpretationContext,
): InterpretationRequest {
  return Object.freeze({
    operation: 'interpretEntry',
    reasoning: 'low',
    instructionsVersion: 'interpretEntry.v1',
    objective: 'Interpret one Entry as durable structured knowledge.',
    instructions,
    entry,
    context,
    outputContract,
  });
}
