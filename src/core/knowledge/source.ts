import { DomainError } from '../error.js';

export type SourceLocator =
  | {
      readonly kind: 'page';
      readonly page: number;
    }
  | {
      readonly kind: 'paragraph';
      readonly paragraph: number;
    }
  | {
      readonly kind: 'timestamp';
      readonly seconds: number;
    };

/**
 * Validates and canonicalizes positions within an Entry.
 */
export function normalizeSourceLocators(
  locators: readonly SourceLocator[] = [],
): readonly SourceLocator[] {
  const normalized = new Map<string, SourceLocator>();

  for (const locator of locators) {
    assertSourceLocator(locator);
    normalized.set(locatorKey(locator), Object.freeze({ ...locator }));
  }

  return Object.freeze([...normalized.values()].sort(compareLocators));
}

function assertSourceLocator(locator: SourceLocator): void {
  if (locator.kind === 'timestamp') {
    const isInvalid = !Number.isFinite(locator.seconds) || locator.seconds < 0;

    if (isInvalid) {
      throw new DomainError('Source timestamp must be a non-negative number');
    }

    return;
  }

  const position = locator.kind === 'page' ? locator.page : locator.paragraph;
  const isInvalid = !Number.isInteger(position) || position < 1;

  if (isInvalid) {
    throw new DomainError(`Source ${locator.kind} must be a positive integer`);
  }
}

function compareLocators(left: SourceLocator, right: SourceLocator): number {
  return locatorKey(left).localeCompare(locatorKey(right));
}

function locatorKey(locator: SourceLocator): string {
  if (locator.kind === 'timestamp') {
    return `timestamp:${locator.seconds}`;
  }

  const position = locator.kind === 'page' ? locator.page : locator.paragraph;

  return `${locator.kind}:${position}`;
}
