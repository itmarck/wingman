import { InvalidInputError } from '../../system/error.js';

export interface PostgresCursor {
  readonly id: string;
  readonly timestamp: string;
}

export function decodeCursor(
  cursor: string | undefined,
  scope: string,
): PostgresCursor | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      value.scope !== scope ||
      typeof value.id !== 'string' ||
      typeof value.timestamp !== 'string'
    ) {
      throw new Error('Invalid cursor');
    }
    return { id: value.id, timestamp: value.timestamp };
  } catch {
    throw new InvalidInputError('Cursor is invalid');
  }
}

export function encodeCursor(value: PostgresCursor | undefined, scope: string): string | null {
  return value ? Buffer.from(JSON.stringify({ ...value, scope })).toString('base64url') : null;
}
