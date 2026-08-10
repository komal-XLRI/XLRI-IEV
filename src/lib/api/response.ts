import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isAppError, RateLimitError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/**
 * Single place where errors become HTTP responses, so no route handler has to
 * decide a status code — and so internal failures never leak a stack trace.
 */
export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    const validation = new ValidationError('Invalid request', flattenZodError(error));
    return NextResponse.json(
      {
        error: { code: validation.code, message: validation.message, details: validation.details },
      },
      { status: validation.status },
    );
  }

  if (isAppError(error)) {
    const headers =
      error instanceof RateLimitError
        ? { 'Retry-After': String(error.retryAfterSeconds) }
        : undefined;

    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers },
    );
  }

  logger.error('Unhandled API error', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}

export function flattenZodError(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    fields[key] ??= issue.message;
  }
  return fields;
}

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

/** Wraps a route handler so every thrown AppError is mapped consistently. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
