import { ConflictError } from '../../system/error.js';

export function asConflict(error: unknown, message: string): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['23503', '23505', '23514'].includes(String(error.code))
  ) {
    throw new ConflictError(message);
  }
  throw error;
}
