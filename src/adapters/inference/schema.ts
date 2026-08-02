import { Type } from 'typebox';
import { Compile } from 'typebox/compile';
import type { RegisterInterpretationInput } from '../../modules/interpretation/domain/input.js';
import type { InterpretationAdapterOutput } from '../../modules/interpretation/services/interpreter.js';

const keyPattern = /^[a-z][A-Za-z0-9]*$/;
const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const object = (properties: Parameters<typeof Type.Object>[0]) =>
  Type.Object(properties, { additionalProperties: false });
const locator = Type.Union([
  object({ kind: Type.Literal('page'), page: Type.Integer({ minimum: 1 }) }),
  object({ kind: Type.Literal('paragraph'), paragraph: Type.Integer({ minimum: 1 }) }),
  object({ kind: Type.Literal('timestamp'), seconds: Type.Number({ minimum: 0 }) }),
]);
const profile = object({
  key: Type.String({ pattern: keyPattern.source }),
  version: Type.Integer({ minimum: 1 }),
});
const item = object({
  reference: Type.String(),
  profile: Type.Union([profile, Type.Null()]),
  referenceStatus: Type.Union([Type.Literal('identified'), Type.Literal('uncertain')]),
});
const component = object({
  reference: Type.String(),
  itemReference: Type.String(),
  key: Type.String({ pattern: keyPattern.source }),
  schemaVersion: Type.Integer({ minimum: 1 }),
  value: Type.Unknown(),
  sourceLocators: Type.Array(locator),
  validTime: Type.Union([
    object({
      from: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
      to: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
    }),
    Type.Null(),
  ]),
  status: Type.Union([
    Type.Literal('accepted'),
    Type.Literal('candidate'),
    Type.Literal('rejected'),
  ]),
  supersedesReference: Type.Union([Type.String(), Type.Null()]),
});
const resolution = object({
  reference: Type.String(),
  question: Type.String(),
  candidateItemIds: Type.Array(Type.String()),
});
const temporal = object({
  from: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
  to: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
  precision: Type.Union([
    Type.Literal('exact'),
    Type.Literal('day'),
    Type.Literal('month'),
    Type.Literal('range'),
    Type.Literal('unspecified'),
  ]),
});
const planningWorkflow = object({
  kind: Type.Literal('planningRequest'),
  version: Type.Literal(1),
  reference: Type.String(),
  profile: Type.Union([
    Type.Literal('task'),
    Type.Literal('objective'),
    Type.Literal('plan'),
    Type.Literal('habit'),
  ]),
  title: Type.String(),
  notes: Type.Union([Type.String(), Type.Null()]),
  temporal: Type.Union([temporal, Type.Null()]),
  recurrence: Type.Union([Type.String(), Type.Null()]),
  unresolved: Type.Array(Type.String()),
});
const reminderSchedule = Type.Union([
  object({
    kind: Type.Literal('occurrences'),
    at: Type.Array(Type.String({ pattern: utcPattern.source }), { minItems: 1 }),
  }),
  object({
    kind: Type.Literal('deadlineOffsets'),
    offsetsBeforeMs: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1 }),
  }),
  object({ kind: Type.Literal('event'), eventKey: Type.String({ pattern: keyPattern.source }) }),
]);
const reminderWorkflow = object({
  kind: Type.Literal('reminderRequest'),
  version: Type.Literal(1),
  reference: Type.String(),
  subjectReference: Type.String(),
  message: Type.String(),
  temporal: Type.Union([temporal, Type.Null()]),
  schedule: reminderSchedule,
  unresolved: Type.Array(Type.String()),
});
const draft = object({
  entryId: Type.String(),
  items: Type.Array(item),
  components: Type.Array(component),
  referenceResolutions: Type.Array(resolution),
  workflows: Type.Array(Type.Union([planningWorkflow, reminderWorkflow])),
});

export const interpretationOutputSchema = {
  ...object({
    kind: Type.Union([Type.Literal('knowledge'), Type.Literal('empty'), Type.Literal('invalid')]),
    reason: Type.Union([Type.String(), Type.Null()]),
    draft: Type.Union([draft, Type.Null()]),
  }),
};

const validator = Compile(interpretationOutputSchema);

/** Validates provider output and removes strict-schema null sentinels. */
export function parseInterpretationOutput(value: unknown): InterpretationAdapterOutput | undefined {
  if (!validator.Check(value)) return undefined;
  const output = value as {
    readonly kind: 'empty' | 'invalid' | 'knowledge';
    readonly reason: string | null;
    readonly draft: StrictDraft | null;
  };
  if (output.kind === 'empty')
    return output.reason === null && output.draft === null ? { kind: 'empty' } : undefined;
  if (output.kind === 'invalid')
    return output.reason && output.draft === null
      ? { kind: 'invalid', reason: output.reason }
      : undefined;
  return output.reason === null && output.draft
    ? { kind: 'knowledge', draft: normalizeDraft(output.draft) }
    : undefined;
}

type StrictDraft = RegisterInterpretationInput & {
  readonly items: readonly (RegisterInterpretationInput['items'][number] & {
    readonly profile: RegisterInterpretationInput['items'][number]['profile'] | null;
  })[];
  readonly components: readonly (RegisterInterpretationInput['components'][number] & {
    readonly validTime: RegisterInterpretationInput['components'][number]['validTime'] | null;
    readonly supersedesReference: string | null;
  })[];
  readonly workflows: readonly StrictWorkflow[];
};

type StrictWorkflow =
  | (Extract<
      NonNullable<RegisterInterpretationInput['workflows']>[number],
      { readonly kind: 'planningRequest' }
    > & {
      readonly notes: string | null;
      readonly temporal: StrictTemporal | null;
      readonly recurrence: string | null;
    })
  | (Extract<
      NonNullable<RegisterInterpretationInput['workflows']>[number],
      { readonly kind: 'reminderRequest' }
    > & {
      readonly temporal: StrictTemporal | null;
    });
type StrictTemporal = {
  readonly from: string | null;
  readonly to: string | null;
  readonly precision: 'exact' | 'day' | 'month' | 'range' | 'unspecified';
};

function normalizeDraft(draft: StrictDraft): RegisterInterpretationInput {
  const components = draft.components.filter(componentHasContent);
  const referencedItems = new Set([
    ...components.map((component) => component.itemReference),
    ...(draft.referenceResolutions ?? []).map((resolution) => resolution.reference),
  ]);
  return Object.freeze({
    entryId: draft.entryId,
    items: Object.freeze(
      draft.items
        .filter((item) => referencedItems.has(item.reference))
        .map(({ profile, ...item }) => Object.freeze({ ...item, profile: profile ?? undefined })),
    ),
    components: Object.freeze(
      components.map(({ validTime, supersedesReference, ...component }) =>
        Object.freeze({
          ...component,
          validTime: validTime
            ? { from: validTime.from ?? undefined, to: validTime.to ?? undefined }
            : undefined,
          supersedesReference: supersedesReference ?? undefined,
        }),
      ),
    ),
    referenceResolutions: Object.freeze(
      (draft.referenceResolutions ?? []).map((request) =>
        Object.freeze({
          ...request,
          candidateItemIds: Object.freeze([...request.candidateItemIds]),
        }),
      ),
    ),
    workflows: Object.freeze(draft.workflows.map(normalizeWorkflow)),
  });
}

function meaningful(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === 'object') return Object.values(value).some(meaningful);
  return true;
}

function componentHasContent(component: StrictDraft['components'][number]): boolean {
  if (['name', 'description', 'quote'].includes(component.key))
    return typeof component.value === 'string' && component.value.trim().length > 0;
  if (component.key === 'aliases')
    return (
      Array.isArray(component.value) &&
      component.value.some((value) => typeof value === 'string' && value.trim().length > 0)
    );
  if (component.key === 'statement') {
    const value = component.value;
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).attribute === 'string' &&
      ((value as Record<string, unknown>).attribute as string).trim().length > 0 &&
      meaningful((value as Record<string, unknown>).value)
    );
  }
  return meaningful(component.value);
}

function normalizeWorkflow(
  workflow: StrictWorkflow,
): NonNullable<RegisterInterpretationInput['workflows']>[number] {
  const temporal = workflow.temporal
    ? Object.freeze({
        from: workflow.temporal.from ?? undefined,
        to: workflow.temporal.to ?? undefined,
        precision: workflow.temporal.precision,
      })
    : undefined;
  if (workflow.kind === 'planningRequest')
    return Object.freeze({
      ...workflow,
      notes: workflow.notes ?? undefined,
      temporal,
      recurrence: workflow.recurrence ?? undefined,
      unresolved: Object.freeze([...workflow.unresolved]),
    });
  return Object.freeze({
    ...workflow,
    temporal,
    unresolved: Object.freeze([...workflow.unresolved]),
    schedule: Object.freeze(structuredClone(workflow.schedule)),
  });
}
