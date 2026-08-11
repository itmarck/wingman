import { Type } from 'typebox';
import { Compile } from 'typebox/compile';
import type { InterpretationDraft } from '../../modules/interpretation/domain/input.js';
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
const consent = Type.Union([Type.Literal('none'), Type.Literal('explicit')], {
  description:
    'Consent requirement: none or explicit. This never increases Capability autonomy; never use blocked, propose, or execute.',
});
const automationTrigger = Type.Union([
  object({
    operator: object({ key: Type.Literal('time'), version: Type.Literal(1) }),
    at: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
    afterMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  }),
  object({
    operator: object({ key: Type.Literal('event'), version: Type.Literal(1) }),
    eventKey: Type.String({ pattern: keyPattern.source }),
  }),
  object({
    operator: object({ key: Type.Literal('stateChange'), version: Type.Literal(1) }),
    itemIds: Type.Array(Type.String()),
    componentKeys: Type.Array(Type.String({ pattern: keyPattern.source })),
  }),
  object({
    operator: object({ key: Type.Literal('schedule'), version: Type.Literal(1) }),
    occurrences: Type.Array(Type.String({ pattern: utcPattern.source }), { minItems: 1 }),
  }),
]);
const intentTemplate = object({
  capability: profile,
  input: Type.Unknown(),
  conditions: Type.Array(Type.Unknown()),
  expectedState: Type.Array(Type.Unknown()),
  consent,
});
const componentDeclaration = object({
  reference: Type.String(),
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
  status: Type.Union(
    [Type.Literal('accepted'), Type.Literal('candidate'), Type.Literal('rejected')],
    {
      description:
        'Knowledge revision status: accepted, candidate, or rejected. Never use Intent lifecycle values such as proposed.',
    },
  ),
  supersedesReference: Type.Union([Type.String(), Type.Null()]),
});
const resolution = object({
  reference: Type.String(),
  question: Type.String(),
  candidateItemIds: Type.Array(Type.String()),
});
const declarationBase = {
  version: Type.Literal(1),
  reference: Type.String(),
  dependsOn: Type.Array(Type.String()),
  unresolved: Type.Array(Type.String()),
};
const itemDeclaration = object({
  ...declarationBase,
  kind: Type.Literal('item'),
  profile: Type.Union([profile, Type.Null()]),
  referenceStatus: Type.Union([Type.Literal('identified'), Type.Literal('uncertain')]),
  components: Type.Array(componentDeclaration),
});
const stateDeclaration = object({
  ...declarationBase,
  kind: Type.Literal('state'),
  modality: Type.Union([
    Type.Literal('observed'),
    Type.Literal('believed'),
    Type.Literal('desired'),
    Type.Literal('required'),
    Type.Literal('forbidden'),
    Type.Literal('predicted'),
  ]),
  condition: Type.Unknown(),
  validTime: Type.Union([
    object({
      from: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
      to: Type.Union([Type.String({ pattern: utcPattern.source }), Type.Null()]),
    }),
    Type.Null(),
  ]),
  confidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
});
const automationDeclaration = object({
  ...declarationBase,
  kind: Type.Literal('automation'),
  subjects: Type.Array(Type.String()),
  given: Type.Array(Type.Unknown()),
  when: automationTrigger,
  thenIntents: Type.Array(intentTemplate, { minItems: 1 }),
  controls: Type.Union([Type.Unknown(), Type.Null()]),
});
const intentDeclaration = object({
  ...declarationBase,
  kind: Type.Literal('intent'),
  capability: profile,
  input: Type.Unknown(),
  conditions: Type.Array(Type.Unknown()),
  expectedState: Type.Array(Type.Unknown()),
  consent,
  trigger: Type.Union([Type.Unknown(), Type.Null()]),
});
const draft = object({
  entryId: Type.String(),
  declarations: Type.Array(
    Type.Union([itemDeclaration, stateDeclaration, automationDeclaration, intentDeclaration]),
  ),
  resolutions: Type.Array(resolution),
});

export const interpretationOutputSchema = {
  ...object({
    kind: Type.Union([Type.Literal('knowledge'), Type.Literal('empty'), Type.Literal('invalid')], {
      description:
        'Exact result discriminator: knowledge, empty, or invalid. Never use interpreted.',
    }),
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

type StrictDraft = InterpretationDraft & {
  readonly declarations: readonly StrictDeclaration[];
};

type StrictDeclaration = InterpretationDraft['declarations'][number] & {
  readonly profile?: { readonly key: string; readonly version: number } | null;
  readonly validTime?: { readonly from: string | null; readonly to: string | null } | null;
  readonly confidence?: number | null;
  readonly controls?: unknown | null;
  readonly trigger?: unknown | null;
};

function normalizeDraft(draft: StrictDraft): InterpretationDraft {
  const declarations = draft.declarations.map(normalizeDeclaration);
  const resolutionReferences = new Set((draft.resolutions ?? []).map(({ reference }) => reference));
  return Object.freeze({
    entryId: draft.entryId,
    declarations: Object.freeze(
      declarations.filter(
        (declaration) =>
          declaration.kind !== 'item' ||
          Boolean(declaration.profile) ||
          declaration.components.length > 0 ||
          resolutionReferences.has(declaration.reference),
      ),
    ),
    resolutions: Object.freeze(
      (draft.resolutions ?? []).map((request) =>
        Object.freeze({
          ...request,
          candidateItemIds: Object.freeze([...request.candidateItemIds]),
        }),
      ),
    ),
  });
}

function normalizeDeclaration(
  declaration: StrictDeclaration,
): InterpretationDraft['declarations'][number] {
  if (declaration.kind === 'item') {
    const { profile: selected, components, ...item } = declaration;
    return Object.freeze({
      ...item,
      profile: selected ?? undefined,
      components: Object.freeze(
        components.filter(componentHasContent).map((component) => {
          const strict = component as typeof component & {
            validTime?: { readonly from: string | null; readonly to: string | null } | null;
            supersedesReference?: string | null;
          };
          return Object.freeze({
            ...component,
            validTime: strict.validTime
              ? { from: strict.validTime.from ?? undefined, to: strict.validTime.to ?? undefined }
              : undefined,
            supersedesReference: strict.supersedesReference ?? undefined,
          });
        }),
      ),
    });
  }
  if (declaration.kind === 'state')
    return Object.freeze({
      ...declaration,
      validTime: declaration.validTime
        ? {
            from: declaration.validTime.from ?? undefined,
            to: declaration.validTime.to ?? undefined,
          }
        : undefined,
      confidence: declaration.confidence ?? undefined,
    });
  if (declaration.kind === 'automation')
    return Object.freeze({ ...declaration, controls: declaration.controls ?? undefined });
  return Object.freeze({ ...declaration, trigger: declaration.trigger ?? undefined });
}

function meaningful(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === 'object') return Object.values(value).some(meaningful);
  return true;
}

function componentHasContent(component: {
  readonly key: string;
  readonly value: unknown;
}): boolean {
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
  if (component.key === 'participants')
    return Array.isArray(component.value) && component.value.filter(meaningful).length >= 2;
  return meaningful(component.value);
}
