import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Chart primitives, drawn with layout rather than a charting library.
 *
 * The dashboard needs proportions, not plotting: a stacked distribution and a
 * completion meter. Both are a handful of divs, which keeps them theme-aware
 * through the same tokens as everything else, printable, screen-readable, and
 * free of a runtime dependency that would ship more JavaScript than the page.
 *
 * Every value is also written out in text. The bar is the summary; the numbers
 * beside it are the data.
 */

export type SeriesTone = 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'neutral';

const FILL: Record<SeriesTone, string> = {
  primary: 'bg-chart-1',
  success: 'bg-chart-2',
  warning: 'bg-chart-3',
  danger: 'bg-chart-4',
  accent: 'bg-chart-5',
  neutral: 'bg-chart-track',
};

const DOT: Record<SeriesTone, string> = {
  primary: 'bg-chart-1',
  success: 'bg-chart-2',
  warning: 'bg-chart-3',
  danger: 'bg-chart-4',
  accent: 'bg-chart-5',
  neutral: 'bg-border-strong',
};

export interface Segment {
  label: string;
  value: number;
  tone: SeriesTone;
}

/**
 * Proportional bar with a legend.
 *
 * Segments below ~1.5% get a floor width so a non-zero count is never rendered
 * as nothing — a category with one record in it must still be visible.
 */
export function StackedBar({
  segments,
  total,
  caption,
}: {
  segments: Segment[];
  /** Defaults to the sum; pass it when the bar represents part of a larger set. */
  total?: number;
  caption?: string;
}) {
  const sum = total ?? segments.reduce((running, segment) => running + segment.value, 0);
  const present = segments.filter((segment) => segment.value > 0);

  if (sum === 0) {
    return (
      <div className="type-secondary flex h-2.5 items-center">
        <span className="bg-chart-track h-2.5 w-full rounded-full" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <div
        className="bg-chart-track flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={
          caption ?? present.map((segment) => `${segment.label}: ${segment.value}`).join(', ')
        }
      >
        {present.map((segment) => (
          <span
            key={segment.label}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', FILL[segment.tone])}
            style={{ width: `${Math.max((segment.value / sum) * 100, 1.5)}%` }}
          />
        ))}
      </div>

      <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className={cn('size-2 shrink-0 rounded-[3px]', DOT[segment.tone])}
            />
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{segment.label}</span>
            <span className="font-semibold tabular-nums">{segment.value}</span>
            <span className="text-muted-foreground w-11 text-right text-xs tabular-nums">
              {sum === 0 ? '0%' : `${Math.round((segment.value / sum) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Single-value completion meter, with the percentage written beside it. */
export function MeterBar({
  value,
  max = 100,
  tone = 'primary',
  label,
  showValue = true,
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  tone?: SeriesTone;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className={cn(
          'bg-chart-track min-w-14 flex-1 overflow-hidden rounded-full',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue ? (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">{percent}%</span>
      ) : null}
    </div>
  );
}

/**
 * Horizontal ranked bars — one row per category.
 *
 * Used for per-activity completion, where twelve rows read far better stacked
 * vertically than as twelve columns squeezed across the page.
 */
export function BarList({
  items,
}: {
  items: Array<{
    id: string;
    label: ReactNode;
    sublabel?: ReactNode;
    value: number;
    max: number;
    tone?: SeriesTone;
    meta?: ReactNode;
  }>;
}) {
  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-4 px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[13.5px] font-medium">{item.label}</span>
              {item.sublabel ? (
                <span className="type-caption shrink-0">{item.sublabel}</span>
              ) : null}
            </div>
            <MeterBar
              className="mt-1.5"
              value={item.value}
              max={item.max}
              tone={item.tone ?? 'primary'}
              size="sm"
              showValue={false}
              label={typeof item.label === 'string' ? item.label : undefined}
            />
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[13px] font-semibold tabular-nums">
              {item.max === 0 ? '—' : `${Math.round((item.value / item.max) * 100)}%`}
            </p>
            {item.meta ? <p className="type-caption">{item.meta}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
