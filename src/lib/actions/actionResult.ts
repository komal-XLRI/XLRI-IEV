import 'server-only';
import { ZodError } from 'zod';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { flattenZodError } from '@/lib/api/response';

/**
 * Server Actions return a discriminated result rather than throwing, so forms
 * can render field-level errors without an error boundary.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function actionSuccess<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function actionFailure(
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}

/**
 * Wraps an action body. Authorisation and validation still happen *inside*
 * the body — this only translates failures into a renderable shape.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return actionSuccess(await body());
  } catch (error) {
    if (error instanceof ZodError) {
      return actionFailure('Please correct the highlighted fields', flattenZodError(error));
    }

    if (isAppError(error)) {
      return actionFailure(
        error.message,
        typeof error.details === 'object' && error.details !== null
          ? (error.details as Record<string, string>)
          : undefined,
      );
    }

    logger.error('Unhandled server action error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return actionFailure('Something went wrong. Please try again.');
  }
}
