import type { ReactNode } from 'react';
import { Inbox, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('surface-card rounded-card overflow-hidden', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-5 py-3.5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span className="bg-primary-soft text-primary-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="type-card-title">{title}</h2>
          {description ? <p className="type-secondary mt-0.5">{description}</p> : null}
        </div>
      </div>
      {action ? (
        <div className="shrink-0" data-print="hide">
          {action}
        </div>
      ) : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/** Footer strip for card-level actions or notes. */
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'surface-sunken flex flex-wrap items-center gap-3 border-t px-5 py-3 text-[13px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page structure                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A titled band of the page, above the cards it groups.
 *
 * Having one of these means section headings are the same size and weight
 * everywhere, which is most of what makes a dashboard feel deliberate rather
 * than assembled.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 className="type-section-title">{title}</h2>
            {description ? <p className="type-secondary mt-0.5">{description}</p> : null}
          </div>
          {action ? (
            <div className="shrink-0" data-print="hide">
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

export type MetricTone = 'neutral' | 'primary' | 'positive' | 'warning' | 'danger' | 'accent';

const METRIC_ICON_TONE: Record<MetricTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  positive: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  accent: 'bg-accent-soft text-accent-soft-foreground',
};

/**
 * Compact KPI tile.
 *
 * The number is the largest thing in it and the label sits above rather than
 * below, so a row of these scans as a row of figures. The icon is a tinted
 * chip rather than a large graphic — it identifies the metric without
 * competing with it.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  trend,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  /** Direction plus a written change; omitted where a delta has no meaning. */
  trend?: { direction: 'up' | 'down'; label: string; good?: boolean };
  href?: string;
}) {
  const TrendIcon = trend?.direction === 'down' ? TrendingDown : TrendingUp;
  const trendGood = trend?.good ?? trend?.direction === 'up';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="type-overline min-w-0 truncate">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
              METRIC_ICON_TONE[tone],
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[1.75rem] leading-8 font-semibold tabular-nums">{value}</p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {hint ? <span className="type-caption">{hint}</span> : null}
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-medium',
              trendGood ? 'text-success-soft-foreground' : 'text-danger-soft-foreground',
            )}
          >
            <TrendIcon className="size-3" aria-hidden="true" />
            {trend.label}
          </span>
        ) : null}
      </div>
    </>
  );

  const className = 'surface-card block rounded-card px-4 py-3.5 transition-colors';

  if (!href) return <div className={className}>{body}</div>;

  return (
    <a href={href} className={cn(className, 'hover:border-primary-border hover:bg-surface-hover')}>
      {body}
    </a>
  );
}

const STAT_VALUE_TONE: Record<'neutral' | 'positive' | 'warning' | 'danger', string> = {
  neutral: '',
  positive: 'text-success-soft-foreground',
  warning: 'text-warning-soft-foreground',
  danger: 'text-danger-soft-foreground',
};

/**
 * A single labelled fact.
 *
 * Distinct from `KpiCard`: this states an attribute of the thing on screen —
 * a window, a duration, an assigned reviewer — so the value is set at reading
 * size rather than headline size, and long text wraps instead of overflowing.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  return (
    <div className="surface-card rounded-card px-4 py-3">
      <p className="type-overline">{label}</p>
      <p className={cn('mt-1 text-[15px] leading-6 font-semibold', STAT_VALUE_TONE[tone])}>
        {value}
      </p>
      {hint ? <p className="type-caption mt-0.5">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Empty state.
 *
 * Sized to the space it occupies rather than always filling a large card: an
 * "all clear" result should read as a tidy confirmation, not as a hole in the
 * page.
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  size = 'md',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-1.5 px-5 py-7' : 'gap-2 px-6 py-10',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'bg-muted text-muted-foreground mb-0.5 inline-flex items-center justify-center rounded-full',
          size === 'sm' ? 'size-8' : 'size-11',
        )}
      >
        <Icon className={size === 'sm' ? 'size-4' : 'size-5'} />
      </span>
      <p className="text-[13.5px] font-semibold">{title}</p>
      {description ? <p className="type-secondary max-w-sm">{description}</p> : null}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton block h-4 w-full', className)} />;
}

/** Card-shaped placeholder, matching KpiCard's box so nothing jumps on load. */
export function KpiSkeleton() {
  return (
    <div className="surface-card rounded-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="size-7 rounded-md" />
      </div>
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="px-5 py-4" role="status" aria-live="polite">
      <span className="sr-only">Loading table data</span>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4', columnIndex === 0 ? 'w-1/4' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="px-5 py-8" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="space-y-2.5">
        <Skeleton className="w-1/3" />
        <Skeleton className="w-full" />
        <Skeleton className="w-5/6" />
      </div>
    </div>
  );
}
