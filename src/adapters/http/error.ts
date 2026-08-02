import type { FastifyInstance } from 'fastify';
import { DomainError } from '../../core/error.js';
import { ApplicationError } from '../../system/error.js';

const applicationStatus = {
  conflict: 409,
  forbidden: 403,
  invalidInput: 400,
  notFound: 404,
} as const;

/**
 * Registers the stable JSON error contract exposed by HTTP.
 */
export function registerErrorHandling(server: FastifyInstance): void {
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApplicationError) {
      return reply.code(applicationStatus[error.code]).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    const clientStatus = readClientErrorStatus(error);

    if (error instanceof DomainError || isValidationError(error) || clientStatus) {
      return reply.code(clientStatus ?? 400).send({
        error: {
          code: 'invalidInput',
          message: getErrorMessage(error),
        },
      });
    }

    request.log.error({ error }, 'Unexpected HTTP error');

    return reply.code(500).send({
      error: {
        code: 'internal',
        message: 'An unexpected error occurred',
      },
    });
  });

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: {
        code: 'notFound',
        message: 'Route does not exist',
      },
    }),
  );
}

function isValidationError(error: unknown): error is Error & { readonly validation: unknown } {
  return error instanceof Error && 'validation' in error;
}

function readClientErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error) || !('statusCode' in error)) {
    return undefined;
  }

  const status = error.statusCode;

  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request is invalid';
}
