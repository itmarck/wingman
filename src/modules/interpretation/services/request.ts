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
  'Preserve the Entry verbatim and never invent information.',
  'Write newly derived human-readable knowledge in Spanish while preserving proper names, acronyms and exact quotations.',
  'Create stable Items for identifiable things and add knowledge through registered Component schemas only.',
  'Use typed itemReference values for simple connections and the relationship Profile with participants for connections that have roles, attributes, evidence, validity or history.',
  'Never invent Component schemas or Profiles; use only contracts supplied in context.',
  'Every proposed Item reference must be identified or uncertain. Uncertain identity must request referenceResolution with candidate Item IDs from context.',
  'Resolve first-person references to Marcelo only for his direct personal statement and never infer authorship from origin.source.',
  'Use the quote Component only for an exact substring of the Entry.',
  'Text Entries may use paragraph locators only; URL Entries use no source locators.',
  'Preserve conflicts as candidate Component revisions and use supersedesReference only for an explicit replacement of the same Component on the same Item.',
  'Return empty only when the Entry contains no durable reusable knowledge and invalid only when this contract cannot be satisfied.',
]);

const outputContract = `Return exactly one result:
- knowledge: a Draft containing entryId, items, components and referenceResolutions.
- empty: an explicit valid decision that the Entry contains no durable knowledge.
- invalid: a reason explaining why the contract could not be satisfied.`;

export function createInterpretationRequest(
  entry: Entry,
  context: InterpretationContext,
): InterpretationRequest {
  return Object.freeze({
    operation: 'interpretEntry',
    reasoning: 'low',
    instructionsVersion: 'interpretEntry.v8',
    objective: 'Interpret one Entry as composable evidence-backed knowledge.',
    instructions,
    entry,
    context,
    outputContract,
  });
}
