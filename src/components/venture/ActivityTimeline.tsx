import Link from 'next/link';
import { ChevronRight, Lock } from 'lucide-react';
import { ActivityStatusBadge, ReviewStatusBadge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { formatDateRange, windowState } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import type { TimelineRow } from '@/types/progress';

/**
 * The venture timeline. `LOCKED` rows are dimmed and never linked — the
 * progression rule is enforced server-side, this just reflects it.
 *
 * Every row states the attempt position and, once anything has been submitted,
 * both reviewers' verdicts. A student should never have to open an activity to
 * find out whether it is waiting on faculty, on their mentor, or on them.
 */
export function ActivityTimeline({
  rows,
  hrefFor,
  showReviewers = true,
}: {
  rows: TimelineRow[];
  hrefFor?: (row: TimelineRow) => string | null;
  showReviewers?: boolean;
}) {
  const now = new Date();

  return (
    <ol className="divide-border divide-y">
      {rows.map((row) => {
        const href = row.uiState === 'LOCKED' ? null : (hrefFor?.(row) ?? null);
        const locked = row.uiState === 'LOCKED';
        const exhausted = row.uiState === 'MAX_ATTEMPTS_REACHED';
        const open =
          row.startDate && row.endDate
            ? windowState(new Date(row.startDate), new Date(row.endDate), now) === 'OPEN'
            : false;

        const content = (
          <div
            className={cn(
              'flex items-start gap-3.5 px-5 py-3.5',
              // Recessed, not dimmed. A locked row still has to be readable —
              // it is where a student looks to find out what unlocks it.
              locked && 'bg-surface-sunken',
              href && 'hover:bg-surface-hover transition-colors',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold',
                row.status === 'COMPLETED'
                  ? 'bg-success text-success-foreground'
                  : exhausted
                    ? 'bg-danger text-danger-foreground'
                    : locked
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary-soft text-primary-soft-foreground',
              )}
            >
              {locked ? <Lock className="size-3.5" aria-hidden="true" /> : row.activityCode}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[13.5px] font-semibold">
                  {locked ? <span className="font-mono text-xs">{row.activityCode} </span> : null}
                  {row.name}
                </p>
                <ActivityStatusBadge state={row.uiState} />
                {open && !locked && row.status !== 'COMPLETED' ? (
                  <span className="text-success-soft-foreground text-[11px] font-semibold">
                    Window open
                  </span>
                ) : null}
              </div>

              <p className="type-caption mt-1">
                {formatDateRange(row.startDate, row.endDate)} · {row.durationDays} days ·{' '}
                {/* Read from the record: the attempt limit is per activity. */}
                {exhausted
                  ? `${row.attemptsUsed}/${row.maxAttempts} attempts used — none left`
                  : `Attempt ${Math.min(row.attemptsUsed + 1, row.maxAttempts)} of ${row.maxAttempts}`}
              </p>

              {showReviewers && !locked && row.attemptsUsed > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ReviewStatusBadge prefix="Faculty" status={row.facultyReviewStatus} />
                  <ReviewStatusBadge prefix="Mentor" status={row.mentorReviewStatus} />
                </div>
              ) : null}

              {locked ? (
                <p className="type-caption mt-1.5">
                  Unlocks when{' '}
                  {row.order <= 1
                    ? 'the programme starts'
                    : 'the previous activity is approved by both reviewers'}
                  .
                </p>
              ) : null}
            </div>

            {href ? (
              <ChevronRight
                className="text-muted-foreground mt-2 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : null}
          </div>
        );

        return (
          <li key={row.recordId}>
            {href ? (
              <Link href={href} className="block">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Headline completion for a whole venture. */
export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium">
          {completed} of {total} activities completed
        </span>
        <span className="text-muted-foreground text-[13px] tabular-nums">{percentage}%</span>
      </div>
      <MeterBar
        value={completed}
        max={total}
        showValue={false}
        tone={percentage === 100 ? 'success' : 'primary'}
        label="Venture completion"
      />
    </div>
  );
}
