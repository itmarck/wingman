export type ApplicationErrorCode = 'conflict' | 'forbidden' | 'invalidInput' | 'notFound';

/**
 * Base error for a system operation that cannot be completed.
 */
export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class InvalidInputError extends ApplicationError {
  constructor(message: string) {
    super('invalidInput', message);
    this.name = 'InvalidInputError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super('conflict', message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super('notFound', message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string) {
    super('forbidden', message);
    this.name = 'ForbiddenError';
  }
}
