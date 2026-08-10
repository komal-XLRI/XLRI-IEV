'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md';

/**
 * Hover is scoped to `enabled:` so a disabled button does not light up under
 * the pointer — the alternative, `pointer-events-none`, would also swallow the
 * not-allowed cursor that tells the user why nothing happened.
 *
 * The outlined variant borders on `input-border`, not on the default `border`.
 * A divider between two blocks and the edge of something you can click are
 * different jobs: the first should recede, the second is what identifies the
 * control at all (WCAG 1.4.11), so it is held to 3:1 like an input's.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground enabled:hover:bg-primary-hover',
  secondary:
    'bg-secondary text-secondary-foreground border border-input-border enabled:hover:bg-secondary-hover enabled:hover:border-border-strong',
  ghost: 'text-foreground enabled:hover:bg-surface-hover',
  danger: 'bg-danger text-danger-foreground enabled:hover:brightness-110',
  success: 'bg-success text-success-foreground enabled:hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        // One disabled treatment for every variant, and it is a *colour*, not an
        // opacity. Dimming the element dims its label with it: a disabled
        // primary button at 60% put its text at 3.2:1, which is a label you have
        // to squint at rather than one you can read and choose not to press.
        // Dropping to the muted pair instead keeps it at 6:1 while removing all
        // the emphasis that made it look pressable.
        'disabled:cursor-not-allowed',
        'disabled:bg-muted disabled:text-muted-foreground disabled:border-input-border disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Disables itself while the enclosing form action is in flight. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  );
}
