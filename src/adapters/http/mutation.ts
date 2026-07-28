import type { FastifyRequest } from 'fastify';
import { ForbiddenError, InvalidInputError } from '../../system/error.js';
import { type MutationMode, mutationModes } from '../../system/proposal.js';

declare module 'fastify' {
  interface FastifyRequest {
    mutationMode: MutationMode;
  }
}

/**
 * Resolves the mutation mode requested by the Connector.
 */
export function readMutationMode(request: FastifyRequest): MutationMode {
  const header = request.headers['x-mutation-mode'];
  const value = Array.isArray(header) ? header[0] : header;
  const requested = value ?? 'readonly';

  if (!mutationModes.includes(requested as MutationMode)) {
    throw new InvalidInputError('X-Mutation-Mode must be readonly, approval, or write');
  }

  return requested as MutationMode;
}

/**
 * Rejects a write operation when the request kept the safe readonly default.
 */
export function requireMutation(mode: MutationMode): Exclude<MutationMode, 'readonly'> {
  if (mode === 'readonly') {
    throw new ForbiddenError('This operation requires approval or write mutation mode');
  }

  return mode;
}
