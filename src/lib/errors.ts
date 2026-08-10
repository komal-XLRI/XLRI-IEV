/**
 * Application error taxonomy. Services throw these; the API layer maps them to
 * HTTP status codes in a single place so no route handler invents its own.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicting state') {
    super(message, 409, 'CONFLICT');
  }
}

/** Business-rule violation (attempt limits, progression locks, dual review). */
export class RuleViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'RULE_VIOLATION', details);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = 'Too many requests', retryAfterSeconds = 60) {
    super(message, 429, 'RATE_LIMITED', { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
