import { DomainError } from '../error.js';

/**
 * Ensures that a required string contains meaningful text.
 */
export function assertText(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainError(`${field} cannot be empty`);
  }
}

/**
 * Produces the normalized form used for names, aliases and definitions.
 */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ensures that a string contains a valid ISO date or date-time.
 */
export function assertDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new DomainError(`${field} must be a valid ISO date`);
  }
}

/**
 * Ensures that a date uses the canonical calendar format.
 */
export function assertDateOnly(value: string, field: string): void {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  const parsed = new Date(`${value}T00:00:00Z`);
  const isSameDate = !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);

  if (!pattern.test(value) || !isSameDate) {
    throw new DomainError(`${field} must use YYYY-MM-DD`);
  }
}

/**
 * Ensures that a timestamp is valid ISO 8601 expressed in UTC.
 */
export function assertUtcDateTime(value: string, field: string): void {
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  const parsed = new Date(value);
  const isValid = !Number.isNaN(parsed.getTime());
  const preservesComponents = isValid && parsed.toISOString().slice(0, 19) === value.slice(0, 19);

  if (!pattern.test(value) || !preservesComponents) {
    throw new DomainError(`${field} must be a valid ISO UTC timestamp`);
  }
}
