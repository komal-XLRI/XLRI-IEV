import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { InputHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * `bg-input` rather than `bg-transparent`: on a tinted or sunken panel a
 * transparent control is indistinguishable from the panel behind it, which is
 * exactly the "invisible input" failure a dark theme tends to produce.
 */
export const CONTROL_CLASSES =
  'w-full rounded-lg border border-input-border bg-input text-foreground px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-input-placeholder hover:border-border-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';

/** The same control, at the density the filter bar needs. */
export const COMPACT_CONTROL_CLASSES = CONTROL_CLASSES.replace('px-3 py-2', 'px-2.5 py-1.5');

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger-soft-foreground ml-0.5" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        // The icon is not decoration: an error that is only red is invisible to
        // a reader who cannot see red.
        <p className="text-danger-soft-foreground flex items-start gap-1 text-xs" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLASSES, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_CLASSES, 'min-h-24', className)} {...props} />;
}

/**
 * `appearance-none` strips the native arrow, so one has to be drawn back —
 * without it a closed select is indistinguishable from a text input, which is
 * the affordance the control depends on. Drawn as an element rather than a
 * background image so it inherits a theme token instead of baking a colour into
 * a data URI.
 */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(CONTROL_CLASSES, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </span>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm', className)}>
      {/* `accent-color` colours the native tick in both themes without
          rebuilding the control out of divs. */}
      <input
        type="checkbox"
        className="border-input-border accent-primary size-4 rounded border"
        {...props}
      />
      {label}
    </label>
  );
}
