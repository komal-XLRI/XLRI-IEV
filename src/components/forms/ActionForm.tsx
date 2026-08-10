'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actions/actionResult';

export type FormAction<T> = (
  prev: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

/**
 * Wraps a Server Action with `useActionState` and renders its result.
 *
 * Field errors come from the server's Zod parse — the client never decides
 * whether an input was acceptable.
 */
export function ActionForm<T>({
  action,
  children,
  successMessage,
  resetOnSuccess,
  onSuccess,
  className,
}: {
  action: FormAction<T>;
  children: (state: {
    fieldErrors?: Record<string, string>;
    result: ActionResult<T> | null;
  }) => ReactNode;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (data: T) => void;
  className?: string;
}) {
  const [state, formAction] = useActionState<ActionResult<T> | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult<T> | null>(null);

  useEffect(() => {
    if (!state?.ok || handled.current === state) return;
    handled.current = state;
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.(state.data);
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {state && !state.ok ? (
        <FormMessage tone="error" className="mb-4">
          {state.message}
        </FormMessage>
      ) : null}

      {state?.ok && successMessage ? (
        <FormMessage tone="success" className="mb-4">
          {successMessage}
        </FormMessage>
      ) : null}

      {children({
        fieldErrors: state && !state.ok ? state.fieldErrors : undefined,
        result: state,
      })}
    </form>
  );
}
