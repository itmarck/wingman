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
  'A specific proper name in the Entry identifies a new Item when no context candidate exists; use uncertain only when the Entry itself leaves identity unknown or multiple context candidates plausibly match.',
  'When identity is uncertain, create only the uncertain Item and its referenceResolution; do not invent Components before the Review resolves identity.',
  'Resolve first-person references to Marcelo only for his direct personal statement and never infer authorship from origin.source.',
  'Use the quote Component only for an exact substring of the Entry.',
  'Emit only Components directly supported by reusable knowledge in the Entry; never emit empty strings, empty objects, empty arrays or schema-filler values.',
  'Text Entries may use paragraph locators only; URL Entries use no source locators.',
  'Preserve conflicts as candidate Component revisions and use supersedesReference only for an explicit replacement of the same Component on the same Item.',
  'Return empty only when the Entry contains no durable reusable knowledge and invalid only when this contract cannot be satisfied.',
  'For an Entry that only requests a task, objective, plan, habit, or reminder, return workflows with empty items and components.',
  'Use unresolved only for genuinely missing required source values; template placeholders are resolved before an Entry reaches Wingman.',
  'Reminder occurrences and deadline offsets must never be empty. Use an event schedule for explicit external event triggers and deadlineOffsets for reminders stated relative to a deadline.',
  'A deadlineOffsets reminder must copy its source deadline into reminder temporal.to as UTC and also into its planning subject; retain the original day or month precision.',
  'Every explicit remind, notify, avísame or recuérdame request must include a reminderRequest even when its event source or Capability is unavailable; the system records unsupported behavior after interpretation.',
  'Keep temporal source precision separate from reminder cadence; never invent exact people, organizations, times, Events, connectors, or operations.',
]);

const outputContract = `Return exactly one result:
- knowledge: a Draft containing entryId, items, components, referenceResolutions and workflows. Items/components or workflows may be empty, but not both.
- empty: an explicit valid decision that the Entry contains no durable knowledge.
- invalid: a reason explaining why the contract could not be satisfied.
Workflow drafts are closed:
- planningRequest@1: reference, profile (task|objective|plan|habit), title, optional notes/temporal/recurrence, and unresolved required source values.
- reminderRequest@1: reference, subjectReference to a planningRequest in the same Draft, message, optional source temporal constraint, one occurrences|deadlineOffsets|event schedule, and unresolved required source values.
Temporal precision is exact|day|month|range|unspecified. A reminder schedule is system policy and never evidence of source precision.`;

export function createInterpretationRequest(
  entry: Entry,
  context: InterpretationContext,
): InterpretationRequest {
  return Object.freeze({
    operation: 'interpretEntry',
    reasoning: 'low',
    instructionsVersion: 'interpretEntry.v9',
    objective: 'Interpret one Entry as composable evidence-backed knowledge.',
    instructions,
    entry,
    context,
    outputContract,
  });
}
