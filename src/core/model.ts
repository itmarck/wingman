import { type Static, type TSchema, Type } from 'typebox';
import { Value } from 'typebox/value';

export const areas = Object.freeze({
  employment: 'Employment',
  freelance: 'Independent work for clients',
  venture: 'Own initiatives',
  wellbeing: 'Health and personal care',
  maintenance: 'Home, purchases, finances and paperwork',
  social: 'Relationships and community participation',
  entertainment: 'Leisure',
});
export type Area = keyof typeof areas;
export const areaSchema = Type.Union([
  Type.Literal('employment'),
  Type.Literal('freelance'),
  Type.Literal('venture'),
  Type.Literal('wellbeing'),
  Type.Literal('maintenance'),
  Type.Literal('social'),
  Type.Literal('entertainment'),
]);
export const idSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
export const textSchema = Type.String({ minLength: 1, maxLength: 20000, pattern: '\\S' });
export const dateSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const nullableText = Type.Union([Type.String({ maxLength: 20000 }), Type.Null()]);
export const temporalSchema = Type.Union([
  Type.String({
    pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2}))?$',
  }),
  Type.Null(),
]);
export const fieldSchema = Type.Object(
  {
    id: idSchema,
    name: textSchema,
    type: Type.Union([
      Type.Literal('text'),
      Type.Literal('number'),
      Type.Literal('boolean'),
      Type.Literal('date'),
      Type.Literal('select'),
      Type.Literal('reference'),
    ]),
    hidden: Type.Optional(Type.Boolean()),
    multiple: Type.Optional(Type.Boolean()),
    options: Type.Optional(Type.Array(textSchema, { minItems: 1, uniqueItems: true })),
    collectionId: Type.Optional(idSchema),
  },
  { additionalProperties: false },
);
export type Field = Static<typeof fieldSchema>;
export const captureSchema = Type.Object(
  {
    text: textSchema,
    inputMode: Type.Union([Type.Literal('Entry'), Type.Literal('Note')]),
    submissionKey: Type.String({ minLength: 1, maxLength: 200, pattern: '\\S' }),
    preset: Type.Optional(Type.Union([Type.Literal('organize'), Type.Literal('taskCapture')])),
    plannedFor: Type.Optional(dateSchema),
    dueAt: Type.Optional(temporalSchema),
  },
  { additionalProperties: false },
);
export type Capture = Static<typeof captureSchema>;
export const collectionSchema = Type.Object(
  {
    id: Type.Optional(idSchema),
    name: textSchema,
    area: areaSchema,
    definitions: Type.Optional(Type.Record(Type.String(), textSchema)),
    fields: Type.Array(fieldSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);
export type CollectionInput = Static<typeof collectionSchema>;
export const recordSchema = Type.Object(
  {
    id: Type.Optional(idSchema),
    collectionId: idSchema,
    title: textSchema,
    subtitle: Type.Optional(nullableText),
    body: Type.Optional(nullableText),
    category: Type.Optional(nullableText),
    percentage: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
    occurredAt: Type.Optional(temporalSchema),
    dueAt: Type.Optional(temporalSchema),
    url: Type.Optional(nullableText),
    values: Type.Optional(
      Type.Record(
        idSchema,
        Type.Union([
          Type.String(),
          Type.Number(),
          Type.Boolean(),
          Type.Null(),
          Type.Array(Type.String()),
        ]),
      ),
    ),
    references: Type.Optional(Type.Record(idSchema, Type.Array(idSchema, { uniqueItems: true }))),
  },
  { additionalProperties: false },
);
export type RecordInput = Static<typeof recordSchema>;
export const linkSchema = Type.Object(
  {
    fromId: idSchema,
    toId: idSchema,
    fieldId: Type.Optional(idSchema),
    context: Type.Optional(textSchema),
  },
  { additionalProperties: false },
);
export type LinkInput = Static<typeof linkSchema>;
export const settingsSchema = Type.Object(
  { timezone: Type.String({ minLength: 1, maxLength: 100 }), taskCapture: Type.Boolean() },
  { additionalProperties: false },
);
export type Settings = Static<typeof settingsSchema>;
export type Decision = {
  destination: 'task' | 'keep' | 'unsupported' | 'undetermined';
  area: Area | 'undetermined';
};

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}
export interface Content extends Timestamps {
  id: string;
  title: string;
  text: string;
  editedText: string | null;
  inputMode: Capture['inputMode'];
  source: string;
  submissionKey: string;
  request: Capture;
  preset: 'organize' | 'taskCapture';
  plannedFor: string | null;
  dueAt: string | null;
  classifiedAt: Date | null;
  classification: (Decision & { outcome: string }) | null;
  attempts: number;
  nextAttemptAt: Date;
  claimToken: string | null;
  leaseUntil: Date | null;
  error: string | null;
}
export type Collection = Omit<CollectionInput, 'id' | 'definitions'> &
  Timestamps & {
    id: string;
    definitions: Record<string, string>;
  };
export type StoredRecord = Omit<RecordInput, 'id' | 'references' | 'values'> &
  Timestamps & {
    id: string;
    values: NonNullable<RecordInput['values']>;
  };
export interface Task extends Timestamps {
  id: string;
  title: string;
  area: Area;
  plannedFor: string | null;
  dueAt: string | null;
  finishedAt: Date | null;
  sourceId: string | null;
}
export interface Notification {
  subjectId: string;
  message: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  deferredUntil: Date | null;
  resolvedAt: Date | null;
}

/** A caller-visible validation or conflict error. */
export class Problem extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
/** Validate module boundaries, including internal callers. */
export function validate<T extends TSchema>(schema: T, value: unknown): asserts value is Static<T> {
  if (!Value.Check(schema, value)) throw new Problem(400, 'Invalid input');
}
/** Reject invalid calendar dates instead of normalizing them. */
export function temporal(value: string | null | undefined): void {
  if (value == null) return;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Problem(400, 'Invalid date');
}
/** Validate definitions without introducing a schema language. */
export function fieldsValid(fields: Field[]): void {
  if (new Set(fields.map((field) => field.id)).size !== fields.length)
    throw new Problem(400, 'Duplicate field ID');
  for (const field of fields) {
    if ((field.type === 'select') !== !!field.options)
      throw new Problem(400, 'Only select fields require options');
    if (field.multiple && !['select', 'reference'].includes(field.type))
      throw new Problem(400, 'Invalid cardinality');
    if (field.collectionId && field.type !== 'reference')
      throw new Problem(400, 'Only references have a target Collection');
  }
}
/** Validate actual values, preserving zero, false, empty text and null. */
export function valuesValid(fields: Field[], values: NonNullable<RecordInput['values']>): void {
  for (const [id, value] of Object.entries(values)) {
    const field = fields.find((field) => field.id === id);
    if (!field || field.type === 'reference')
      throw new Problem(400, 'Unknown or reference field in values');
    if (value === null) continue;
    if (field.type === 'select') {
      const selections = field.multiple ? value : [value];
      if (
        !Array.isArray(selections) ||
        selections.some((v) => typeof v !== 'string' || !field.options?.includes(v)) ||
        new Set(selections).size !== selections.length
      )
        throw new Problem(400, 'Invalid selection');
    } else if (field.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Problem(400, 'Invalid date field');
      temporal(value);
    } else if (
      typeof value !== (field.type === 'text' ? 'string' : field.type) ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Problem(400, 'Invalid field value');
  }
}
