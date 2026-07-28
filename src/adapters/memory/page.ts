import { InvalidInputError } from '../../system/error.js';
import type { Page, PageRequest } from '../../system/page.js';

interface CursorPosition {
  readonly id: string;
  readonly timestamp: string;
}

interface CursorKey extends CursorPosition {
  readonly scope: string;
}

/**
 * Creates a stable descending cursor page for an in-memory collection.
 */
export function createPage<Value>(
  values: Iterable<Value>,
  request: PageRequest,
  getKey: (value: Value) => CursorPosition,
): Page<Value> {
  const cursor = request.cursor ? decodeCursor(request.cursor, request.scope) : undefined;
  const sorted = [...values].sort((left, right) => compareKeys(getKey(left), getKey(right)));
  const available = cursor
    ? sorted.filter((value) => compareKeys(getKey(value), cursor) > 0)
    : sorted;
  const hasNextPage = available.length > request.limit;
  const items = available.slice(0, request.limit);
  const last = items.at(-1);

  return Object.freeze({
    items: Object.freeze(items),
    nextCursor:
      hasNextPage && last
        ? encodeCursor({
            ...getKey(last),
            scope: request.scope,
          })
        : null,
  });
}

function compareKeys(left: CursorPosition, right: CursorPosition): number {
  const timestampOrder = right.timestamp.localeCompare(left.timestamp);

  return timestampOrder !== 0 ? timestampOrder : right.id.localeCompare(left.id);
}

function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeCursor(cursor: string, scope: string): CursorKey {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

    if (!isCursorKey(value) || value.scope !== scope) {
      throw new Error('Invalid cursor value');
    }

    return value;
  } catch {
    throw new InvalidInputError('Cursor is invalid');
  }
}

function isCursorKey(value: unknown): value is CursorKey {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.scope === 'string' &&
    typeof candidate.timestamp === 'string'
  );
}
