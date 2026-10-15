import { type Static, type TSchema, Type } from 'typebox';
import { Value } from 'typebox/value';

export const areas = Object.freeze({
  employment: 'Employment: my job, its tasks, meetings, colleagues and job-required learning',
  freelance: 'Independent work for clients: proposals, deliveries, invoices',
  venture: 'Own initiatives and side projects I build for myself',
  wellbeing: 'Health and personal care: body, mind, sleep, exercise, medical',
  maintenance: 'Home, purchases, finances and paperwork',
  social: 'Relationships, family and community',
  entertainment: 'Leisure: movies, series, games, hobbies, trips for fun',
});
export type Area = keyof typeof areas;
export const kinds = ['note', 'task', 'project'] as const;
export type Kind = (typeof kinds)[number];
export const contexts = Object.freeze({
  home: 'Needs to be at home',
  computer: 'Needs a computer',
  outside: 'Needs to go somewhere outside',
  phone: 'Can be done with just a phone',
});
export type Context = keyof typeof contexts;
/** Fixed id of the system Settings Collection, created by the migration. */
export const settingsCollectionId = '00000000-0000-7000-8000-000000000001';

const literals = <T extends string>(values: readonly T[]) => Type.Enum([...values]);
export const areaSchema = literals(Object.keys(areas) as Area[]);
export const kindSchema = literals(kinds);
export const contextSchema = literals(Object.keys(contexts) as Context[]);
export const idSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
export const textSchema = Type.String({ minLength: 1, maxLength: 20000, pattern: '\\S' });
export const titleSchema = Type.String({ minLength: 1, maxLength: 300, pattern: '\\S' });
export const dateSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
/** A calendar date, or an ISO instant with an explicit offset. */
export const temporalSchema = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,3})?)?(Z|[+-]\\d{2}:\\d{2}))?$',
});
const nullable = <T extends TSchema>(schema: T) => Type.Optional(Type.Union([schema, Type.Null()]));
const nullableText = nullable(Type.String({ maxLength: 20000 }));
const level = (maximum: number) => nullable(Type.Integer({ minimum: 0, maximum }));

export const captureSchema = Type.Object(
  {
    kind: literals(['note', 'task'] as const),
    text: textSchema,
    submissionKey: Type.String({ minLength: 1, maxLength: 200, pattern: '\\S' }),
    occurredAt: Type.Optional(temporalSchema),
    plannedFor: Type.Optional(dateSchema),
    dueAt: Type.Optional(temporalSchema),
  },
  { additionalProperties: false },
);
export type Capture = Static<typeof captureSchema>;
export const projectSchema = Type.Object(
  { title: titleSchema, text: Type.Optional(textSchema), area: areaSchema },
  { additionalProperties: false },
);
export type ProjectInput = Static<typeof projectSchema>;
export const entryPatchSchema = Type.Object(
  {
    title: Type.Optional(titleSchema),
    editedText: nullableText,
    area: Type.Optional(areaSchema),
    parentId: nullable(idSchema),
    occurredAt: nullable(temporalSchema),
    plannedFor: nullable(dateSchema),
    dueAt: nullable(temporalSchema),
    context: nullable(contextSchema),
    effort: level(3),
    importance: level(3),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type EntryPatch = Static<typeof entryPatchSchema>;
export const entryFilterSchema = Type.Object(
  {
    kind: Type.Optional(kindSchema),
    area: Type.Optional(areaSchema),
    parentId: Type.Optional(idSchema),
    open: Type.Optional(Type.Boolean()),
    archived: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000000 })),
  },
  { additionalProperties: false },
);
export type EntryFilter = Static<typeof entryFilterSchema>;

export const fieldTypes = [
  'text',
  'number',
  'boolean',
  'date',
  'select',
  'url',
  'reference',
] as const;
export const fieldSchema = Type.Object(
  {
    id: idSchema,
    name: titleSchema,
    description: Type.Optional(titleSchema),
    type: literals(fieldTypes),
    options: Type.Optional(Type.Array(titleSchema, { minItems: 1, uniqueItems: true })),
    multiple: Type.Optional(Type.Boolean()),
    collectionId: Type.Optional(idSchema),
  },
  { additionalProperties: false },
);
export type Field = Static<typeof fieldSchema>;
/** General Record columns; Collections only describe their meaning in definitions. */
export const recordColumns = [
  'title',
  'subtitle',
  'body',
  'category',
  'rating',
  'amount',
  'url',
  'checked',
  'occurredAt',
  'dueAt',
] as const;
/** Record timestamps a Collection may show in the panel, read only. */
export const readOnlyColumns = ['createdAt', 'updatedAt'] as const;
export const collectionSchema = Type.Object(
  {
    name: titleSchema,
    area: nullable(areaSchema),
    definitions: Type.Optional(
      Type.Record(
        Type.String({ pattern: `^(${[...recordColumns, ...readOnlyColumns].join('|')})$` }),
        titleSchema,
      ),
    ),
    fields: Type.Optional(Type.Array(fieldSchema, { maxItems: 50 })),
    /** General columns and extra field IDs the panel shows; title always shows. */
    visible: Type.Optional(Type.Array(Type.String(), { maxItems: 70, uniqueItems: true })),
  },
  { additionalProperties: false },
);
export type CollectionInput = Static<typeof collectionSchema>;
export const collectionPatchSchema = Type.Partial(collectionSchema, {
  additionalProperties: false,
  minProperties: 1,
});
export type CollectionPatch = Static<typeof collectionPatchSchema>;
const valueSchema = Type.Union([
  Type.String({ maxLength: 20000 }),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
  Type.Array(Type.String({ maxLength: 300 })),
]);
export const recordSchema = Type.Object(
  {
    title: titleSchema,
    subtitle: nullableText,
    body: nullableText,
    category: nullableText,
    rating: nullable(Type.Number()),
    amount: nullable(Type.Number()),
    url: nullableText,
    checked: nullable(Type.Boolean()),
    occurredAt: nullable(temporalSchema),
    dueAt: nullable(temporalSchema),
    values: Type.Optional(Type.Record(idSchema, valueSchema)),
    references: Type.Optional(Type.Record(idSchema, Type.Array(idSchema, { uniqueItems: true }))),
  },
  { additionalProperties: false },
);
export type RecordInput = Static<typeof recordSchema>;
export const recordPatchSchema = Type.Partial(recordSchema, {
  additionalProperties: false,
  minProperties: 1,
});
export type RecordPatch = Static<typeof recordPatchSchema>;
export const linkSchema = Type.Object(
  { toId: idSchema, fieldId: Type.Optional(idSchema), note: Type.Optional(textSchema) },
  { additionalProperties: false },
);
export type LinkInput = Static<typeof linkSchema> & { fromId: string };
export const preferenceSchema = Type.Object(
  { kind: kindSchema, text: Type.String({ minLength: 1, maxLength: 1000, pattern: '\\S' }) },
  { additionalProperties: false },
);
export type PreferenceInput = Static<typeof preferenceSchema>;

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}
export interface Entry extends Timestamps {
  id: string;
  kind: Kind;
  title: string;
  text: string;
  editedText: string | null;
  area: Area | null;
  parentId: string | null;
  source: string;
  occurredAt: Date | null;
  plannedFor: string | null;
  dueAt: Date | null;
  finishedAt: Date | null;
  context: Context | null;
  effort: number | null;
  importance: number | null;
  classifiedAt: Date | null;
  attempts: number;
  error: string | null;
}

/** A caller-visible validation or conflict error. */
export class Problem extends Error {
  constructor(
    public statusCode: number,
    message: string,
    /** The offending input property, as a dotted path (e.g. "fields.0.name"). */
    public field?: string,
  ) {
    super(message);
  }
}
/** A schema validation error, as reported by TypeBox. */
type InvalidValue = {
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
  message?: string;
};
/** The first schema error as a readable message and the property it refers to. */
export function describeInvalid(errors: InvalidValue[]): { message: string; field?: string } {
  // A nullable value also fails its null alternative and the union itself; those add nothing.
  const error =
    errors.find(
      (e) => e.keyword !== 'anyOf' && !(e.keyword === 'type' && e.params.type === 'null'),
    ) ?? errors[0];
  if (!error) return { message: 'Invalid input' };
  const { keyword, params } = error;
  const path = error.instancePath.split('/').filter(Boolean);
  // A missing or unknown property is reported on its parent, so name the property itself.
  const property = [params.requiredProperties, params.additionalProperties].flat().find(Boolean);
  if (property) path.push(String(property));
  const rules: Record<string, string> = {
    required: 'is required',
    additionalProperties: 'is not allowed',
    enum: 'is not a valid option',
    minLength: 'must not be empty',
    pattern: params.pattern === '\\S' ? 'must not be empty' : 'has an invalid format',
  };
  const field = path.join('.');
  if (!field)
    return { message: keyword === 'minProperties' ? 'Nothing to change' : 'Invalid input' };
  return { message: `${field} ${rules[keyword] ?? error.message}`, field };
}
/** Validate module boundaries, including internal callers. */
export function validate<T extends TSchema>(schema: T, value: unknown): asserts value is Static<T> {
  if (Value.Check(schema, value)) return;
  const { message, field } = describeInvalid(Value.Errors(schema, value) as InvalidValue[]);
  throw new Problem(400, message, field);
}
/** The first line of a text, bounded, as its title. */
export function titleOf(text: string): string {
  return text.trim().split(/\r?\n/)[0].slice(0, 300);
}
/** Only HTTP(S) URLs are stored; files live elsewhere. */
export function urlValid(url: string | null | undefined): void {
  if (!url) return;
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error();
  } catch {
    throw new Problem(400, 'URL must be HTTP or HTTPS');
  }
}
/** Validate extra field definitions without introducing a schema language. */
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
/** Validate that visible only names hideable general columns and non-reference extra fields. */
export function visibleValid(visible: string[], fields: Field[]): void {
  const known = [
    ...recordColumns.filter((column) => column !== 'title'),
    ...readOnlyColumns,
    ...fields.filter((field) => field.type !== 'reference').map((field) => field.id),
  ];
  const unknown = visible.find((key) => !known.includes(key));
  if (unknown) throw new Problem(400, `visible ${unknown} is not a column or field`, 'visible');
}
/** Validate extra values, preserving zero, false, empty text and null. */
export function valuesValid(fields: Field[], values: Record<string, unknown>): void {
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
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !dayValid(value))
        throw new Problem(400, 'Invalid date field');
    } else if (field.type === 'url') {
      if (typeof value !== 'string') throw new Problem(400, 'Invalid field value');
      urlValid(value);
    } else if (
      typeof value !== (field.type === 'text' ? 'string' : field.type) ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Problem(400, 'Invalid field value');
  }
}
/** Whether a YYYY-MM-DD string is a real calendar day. */
export function dayValid(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}
