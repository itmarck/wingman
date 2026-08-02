import { Type } from 'typebox';
import { Compile } from 'typebox/compile';
import type { RegisterInterpretationInput } from '../../modules/interpretation/domain/input.js';
import type { InterpretationAdapterOutput } from '../../modules/interpretation/services/interpreter.js';

const customPredicateKeyPattern = /^[a-z][A-Za-z0-9]*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const utcDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const ref = (name: string) => Type.Ref(`#/$defs/${name}`);
const object = (properties: Parameters<typeof Type.Object>[0]) =>
  Type.Object(properties, { additionalProperties: false });

const definitions = {
  SourceLocator: Type.Union([
    object({
      kind: Type.Literal('page'),
      page: Type.Integer({ minimum: 1 }),
    }),
    object({
      kind: Type.Literal('paragraph'),
      paragraph: Type.Integer({ minimum: 1 }),
    }),
    object({
      kind: Type.Literal('timestamp'),
      seconds: Type.Number({ minimum: 0 }),
    }),
  ]),
  Literal: Type.Union([
    object({ kind: Type.Literal('boolean'), value: Type.Boolean() }),
    object({ kind: Type.Literal('date'), value: Type.String({ pattern: datePattern.source }) }),
    object({
      kind: Type.Literal('dateTime'),
      value: Type.String({ pattern: utcDateTimePattern.source }),
    }),
    object({ kind: Type.Literal('number'), value: Type.Number() }),
    object({ kind: Type.Literal('quote'), value: Type.String() }),
    object({ kind: Type.Literal('text'), value: Type.String() }),
    object({ kind: Type.Literal('url'), value: Type.String() }),
  ]),
  InterpretationObject: Type.Union([
    object({
      kind: Type.Literal('concept'),
      conceptReference: Type.String(),
    }),
    object({
      kind: Type.Literal('literal'),
      literal: ref('Literal'),
    }),
  ]),
  Concept: object({
    reference: Type.String(),
    name: Type.String(),
    aliases: Type.Array(Type.String()),
    definition: Type.String(),
    referenceStatus: Type.Union([Type.Literal('identified'), Type.Literal('uncertain')]),
  }),
  Predicate: object({
    key: Type.String({ pattern: customPredicateKeyPattern.source }),
    definition: Type.String(),
    origin: Type.Literal('custom'),
    scope: Type.Union([Type.Literal('axiom'), Type.Literal('both'), Type.Literal('link')]),
    mode: Type.Literal('descriptive'),
  }),
  Axiom: object({
    reference: Type.String(),
    subjectReference: Type.String(),
    predicateKey: Type.String({ pattern: customPredicateKeyPattern.source }),
    object: ref('InterpretationObject'),
    sourceLocators: Type.Array(ref('SourceLocator')),
  }),
  Link: object({
    sourceReference: Type.String(),
    predicateKey: Type.String(),
    targetReference: Type.String(),
    sourceLocators: Type.Array(ref('SourceLocator')),
  }),
  ReferenceResolution: object({
    reference: Type.String(),
    question: Type.String(),
    candidateConceptIds: Type.Array(Type.String()),
  }),
  Draft: object({
    entryId: Type.String(),
    concepts: Type.Array(ref('Concept')),
    predicates: Type.Array(ref('Predicate')),
    axioms: Type.Array(ref('Axiom')),
    links: Type.Array(ref('Link')),
    referenceResolutions: Type.Array(ref('ReferenceResolution')),
  }),
};

export const interpretationOutputSchema = {
  ...object({
    kind: Type.Union([Type.Literal('knowledge'), Type.Literal('empty'), Type.Literal('invalid')]),
    reason: Type.Union([Type.String(), Type.Null()]),
    draft: Type.Union([ref('Draft'), Type.Null()]),
  }),
  $defs: definitions,
};

const validator = Compile(interpretationOutputSchema);

/**
 * Validates provider output and removes nullable fields used only by strict JSON Schema.
 */
export function parseInterpretationOutput(value: unknown): InterpretationAdapterOutput | undefined {
  if (!validator.Check(value)) {
    return undefined;
  }

  const output = value as {
    readonly kind: 'empty' | 'invalid' | 'knowledge';
    readonly reason: string | null;
    readonly draft: RegisterInterpretationInput | null;
  };

  if (output.kind === 'empty') {
    return output.reason === null && output.draft === null ? { kind: 'empty' } : undefined;
  }

  if (output.kind === 'invalid') {
    return output.reason && output.draft === null
      ? {
          kind: 'invalid',
          reason: output.reason,
        }
      : undefined;
  }

  return output.reason === null && output.draft
    ? {
        kind: 'knowledge',
        draft: output.draft,
      }
    : undefined;
}
