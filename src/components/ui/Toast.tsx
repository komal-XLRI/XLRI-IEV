'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Application-level notifications.
 *
 * Replaces `window.alert`, which blocks the page, cannot be styled, cannot be
 * dismissed by keyboard in a predictable way, and looks like a browser error
 * rather than part of the product.
 */

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONES: Record<ToastTone, { classes: string; Icon: typeof Info; label: string }> = {
  success: {
    classes: 'border-success-border bg-success-soft text-success-soft-foreground',
    Icon: CheckCircle2,
    label: 'Success',
  },
  error: {
    classes: 'border-danger-border bg-danger-soft text-danger-soft-foreground',
    Icon: AlertTriangle,
    label: 'Error',
  },
  info: {
    classes: 'border-info-border bg-info-soft text-info-soft-foreground',
    Icon: Info,
    label: 'Note',
  },
};

/** Errors stay until dismissed; anything else clears itself. */
const AUTO_DISMISS_MS: Record<ToastTone, number | null> = {
  success: 4500,
  info: 5500,
  error: null,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      // Cap the stack so a loop of failures cannot bury the page.
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);

      const ttl = AUTO_DISMISS_MS[toast.tone];
      if (ttl !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ttl),
        );
      }
    },
    [dismiss],
  );

  // Read inside the effect, not during render: the ref is only ever needed for
  // cleanup, and touching `.current` while rendering is what makes a component
  // miss updates.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* `polite` rather than `assertive`: these announce after the user's
          current utterance instead of interrupting it. */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        data-print="hide"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => {
          const { classes, Icon, label } = TONES[toast.tone];

          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'animate-toast-in rounded-card shadow-raised pointer-events-auto flex w-full max-w-sm items-start gap-2.5 border px-3.5 py-3',
                classes,
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="sr-only">{label}: </span>
                <p className="text-[13px] leading-5 font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-5">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                // Tinted with the toast's own foreground rather than dimmed with
                // opacity, so the glyph keeps the tone's guaranteed contrast.
                className="-mt-0.5 -mr-1 rounded p-1 transition-colors hover:bg-current/15"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
