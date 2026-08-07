import { DomainError } from '../../../core/error.js';
import { assertText } from '../../../core/knowledge/guard.js';

export const reasoningLevels = ['low', 'high'] as const;
export type ReasoningLevel = (typeof reasoningLevels)[number];

interface InterpretationDefinition {
  readonly operation: 'interpret-entry';
  readonly reasoning: ReasoningLevel;
  readonly policies: readonly string[];
  readonly outputContract: string;
}

function definePolicy(...sentences: readonly string[]): string {
  if (sentences.length === 0) throw new DomainError('A Policy requires at least one sentence');

  for (const sentence of sentences) {
    assertText(sentence, 'Policy sentence');
    if (/\r|\n/.test(sentence)) throw new DomainError('Policy sentences must use one line');
    if (!/[.!?]$/.test(sentence))
      throw new DomainError('Policy sentences must end with punctuation');
  }

  return sentences.join(' ');
}

function defineInterpretation(definition: InterpretationDefinition): InterpretationDefinition {
  assertText(definition.operation, 'Interpretation operation');
  assertText(definition.outputContract, 'Interpretation output contract');
  return Object.freeze({
    ...definition,
    policies: Object.freeze([...definition.policies]),
  });
}

export const Policy = Object.freeze({
  preserveSourceIntegrity: definePolicy(
    'Preserve the Entry verbatim.',
    'Never invent information.',
  ),
  deriveKnowledgeInSpanish: definePolicy(
    'Write newly derived human-readable knowledge in Spanish.',
    'Preserve proper names, acronyms, and exact quotations.',
  ),
  useRegisteredKnowledgeContracts: definePolicy(
    'Create stable Items for identifiable things.',
    'Use only registered Component schemas and Profiles supplied in context.',
    'Never invent Component schemas or Profiles.',
  ),
  chooseRelationshipRepresentation: definePolicy(
    'Use typed itemReference values for simple connections.',
    'Use the relationship Profile with participants when a connection has roles, attributes, evidence, validity, or history.',
  ),
  resolveItemIdentity: definePolicy(
    'Classify every proposed Item reference as identified or uncertain.',
    'A specific proper name in the Entry identifies a new Item when no context candidate exists.',
    'Use uncertain only when the Entry itself leaves identity unknown or multiple context candidates plausibly match.',
    'Request referenceResolution with candidate Item IDs from context for every uncertain identity.',
    'When identity is uncertain, create only the uncertain Item and its referenceResolution.',
    'Never invent Components before Review resolves an uncertain identity.',
  ),
  resolveDirectFirstPersonAsMarcelo: definePolicy(
    'Resolve first-person references to Marcelo only for his direct personal statement.',
    'Never infer authorship from origin.source.',
  ),
  preserveVerbatimEvidence: definePolicy(
    'Use the quote Component only for an exact substring of the Entry.',
    'Use only paragraph locators for text Entries.',
    'Use no source locators for URL Entries.',
  ),
  emitOnlyDurableKnowledge: definePolicy(
    'Emit only Components directly supported by reusable knowledge in the Entry.',
    'Never emit empty strings, empty objects, empty arrays, or schema-filler values.',
  ),
  preserveConflictingRevisions: definePolicy(
    'Preserve conflicts as candidate Component revisions.',
    'Use supersedesReference only for an explicit replacement of the same Component on the same Item.',
  ),
  selectValidInterpretationResult: definePolicy(
    'Return empty only when the Entry contains no durable reusable knowledge.',
    'Return invalid only when this contract cannot be satisfied.',
  ),
  routeActionRequestsToWorkflows: definePolicy(
    'Return workflows with empty items and components when an Entry only requests a task, objective, plan, habit, or reminder.',
    'Use unresolved only for genuinely missing required source values.',
    'Template placeholders are resolved before an Entry reaches Wingman.',
  ),
  requireExplicitReminderSchedule: definePolicy(
    'Never emit empty reminder occurrences or deadline offsets.',
    'Use an event schedule for explicit external event triggers.',
    'Use deadlineOffsets for reminders stated relative to a deadline.',
  ),
  preserveReminderDeadline: definePolicy(
    'Copy a deadlineOffsets source deadline into reminder temporal.to as UTC.',
    'Copy the same deadline into the planning subject.',
    'Retain the original day or month precision.',
    'For fin de mes or end of month, calculate temporal.to as the final UTC instant of the month containing entry.capturedAt.',
    'Treat the end-of-month instant as a derived boundary, not an invented exact time.',
  ),
  preserveExplicitReminderRequests: definePolicy(
    'Include a reminderRequest for every explicit remind, notify, avísame, or recuérdame request even when its event source or Capability is unavailable.',
    'Record unsupported behavior after interpretation.',
  ),
  preserveTemporalPrecision: definePolicy(
    'Keep temporal source precision separate from reminder cadence.',
    'Never invent exact people, organizations, times, Events, connectors, or operations.',
  ),
});

export const entryInterpretation = defineInterpretation({
  operation: 'interpret-entry',
  reasoning: 'low',
  policies: Object.values(Policy),
  outputContract: `Return exactly one result:
- knowledge: a Draft containing entryId, items, components, referenceResolutions and workflows. Items/components or workflows may be empty, but not both.
- empty: an explicit valid decision that the Entry contains no durable knowledge.
- invalid: a reason explaining why the contract could not be satisfied.
Workflow drafts are closed:
- planningRequest@1: reference, profile (task|objective|plan|habit), title, optional notes/temporal/recurrence, and unresolved required source values.
- reminderRequest@1: reference, subjectReference to a planningRequest in the same Draft, message, optional source temporal constraint, one occurrences|deadlineOffsets|event schedule, and unresolved required source values.
Temporal precision is exact|day|month|range|unspecified. A reminder schedule is system policy and never evidence of source precision.`,
});
