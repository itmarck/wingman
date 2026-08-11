import { InvalidInputError } from '../../system/error.js';

/** Converts a PostgreSQL timestamp into the canonical UTC representation used by the domain. */
export function dateTime(value: unknown, name: string): string {
  const date = value instanceof Date ? value : new Date(assertString(value, name));
  if (Number.isNaN(date.getTime())) throw new InvalidInputError(`${name} is invalid`);
  return date.toISOString();
}

export function optionalDateTime(value: unknown, name: string): string | undefined {
  return value === null || value === undefined ? undefined : dateTime(value, name);
}

export function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new InvalidInputError(`${name} must be text`);
  return value;
}

export function optionalString(value: unknown, name: string): string | undefined {
  return value === null || value === undefined ? undefined : assertString(value, name);
}

export function assertNumber(value: unknown, name: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new InvalidInputError(`${name} must be a number`);
  return number;
}

/** Clones and recursively freezes JSON values before they cross the adapter boundary. */
export function json<Value>(value: unknown, name: string): Value {
  if (value === undefined) throw new InvalidInputError(`${name} is missing`);
  return deepFreeze(structuredClone(value)) as Value;
}

export function optionalJson<Value>(value: unknown): Value | undefined {
  return value === null || value === undefined ? undefined : json<Value>(value, 'JSON value');
}

export function freezeList<Value>(values: readonly Value[]): readonly Value[] {
  return Object.freeze([...values]);
}

/** Serializes objects and arrays explicitly so node-postgres does not infer PostgreSQL arrays. */
export function jsonValue(value: unknown): string {
  return JSON.stringify(value);
}

/** Compares persisted JSON independently from jsonb object-key ordering. */
export function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function deepFreeze<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    for (const child of value) deepFreeze(child);
    return Object.freeze(value) as Value;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  return value;
}
