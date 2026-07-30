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
  readonly predicateUsage: {
    readonly axiomKeys: readonly string[];
    readonly linkKeys: readonly string[];
  };
  readonly outputContract: string;
}

const instructions = Object.freeze([
  'Preserve the meaning of the Entry without inventing information.',
  'Write all newly created human-readable knowledge in Spanish, including Concept names, aliases, definitions, Predicate definitions, and invalid reasons.',
  'Preserve proper names, acronyms, quotations, and technical terms in their original language when translating them would lose meaning or context.',
  'When useful for future resolution, keep an important original-language term as an alias while defining its Concept in Spanish.',
  'Resolve first-person references to Marcelo only when the Entry is his direct personal statement.',
  'Never infer authorship from origin.source; when authorship or any Concept reference is uncertain, request a reference resolution with a concise question and candidate Concept IDs from context.',
  'An external statement may remain a quote without resolving its author; resolve the author only when used as a Concept reference.',
  'Use quote literals only for exact substrings of the Entry; never translate, paraphrase, or replace quotation marks.',
  'Extract only durable and reusable knowledge.',
  'Reuse relevant Concepts and Predicates from the supplied context when they mean the same thing.',
  'Create a custom Predicate when the context has no suitable Predicate for a durable fact.',
  'List only newly defined custom Predicates in the Draft; reference reused context Predicates directly by key.',
  'Use stable English lower camelCase Predicate keys such as worksAt; do not translate keys or use spaces, hyphens, underscores, or PascalCase.',
  'Only reuse system.camelCase Predicate keys supplied in the context; never invent system Predicates.',
  'Use reused Predicate keys only as allowed by predicateUsage and new custom Predicates only as allowed by their scope; system.supersedes is only for Links that represent actual Axiom replacement.',
  'Text Entries may use paragraph locators only; URL Entries must use no source locators.',
  'Use references that exist in the Draft or in the supplied context.',
  'Return empty only when the Entry legitimately contains no durable knowledge.',
  'Return invalid when the operation cannot satisfy the output contract.',
]);

const outputContract = `Return exactly one result:
- knowledge: a Draft containing entryId, concepts, predicates, axioms, links and referenceResolutions.
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
    instructionsVersion: 'interpretEntry.v5',
    objective: 'Interpret one Entry as durable structured knowledge.',
    instructions,
    entry,
    context,
    predicateUsage: Object.freeze({
      axiomKeys: Object.freeze(
        context.predicates
          .filter((predicate) => predicate.supports('axiom'))
          .map((predicate) => predicate.key),
      ),
      linkKeys: Object.freeze(
        context.predicates
          .filter((predicate) => predicate.supports('link'))
          .map((predicate) => predicate.key),
      ),
    }),
    outputContract,
  });
}
