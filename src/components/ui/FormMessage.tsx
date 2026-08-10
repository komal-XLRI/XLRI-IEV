import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const TONES = {
  error: {
    classes: 'bg-danger-soft text-danger-soft-foreground border-danger-border',
    Icon: AlertTriangle,
    prefix: 'Error',
  },
  success: {
    classes: 'bg-success-soft text-success-soft-foreground border-success-border',
    Icon: CheckCircle2,
    prefix: 'Success',
  },
  warning: {
    classes: 'bg-warning-soft text-warning-soft-foreground border-warning-border',
    Icon: AlertTriangle,
    prefix: 'Warning',
  },
  info: {
    classes: 'bg-info-soft text-info-soft-foreground border-info-border',
    Icon: Info,
    prefix: 'Note',
  },
} as const;

/**
 * Alert strip for form-level feedback.
 *
 * Each tone carries an icon and an off-screen word as well as a colour, so the
 * difference between "saved" and "failed" survives greyscale, a colour-vision
 * deficiency, and a screen reader.
 */
export function FormMessage({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  const { classes, Icon, prefix } = TONES[tone];

  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        classes,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{prefix}: </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
