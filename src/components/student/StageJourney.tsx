import Link from 'next/link';
import { ArrowRight, Check, CircleDashed, Lock, MapPin } from 'lucide-react';
import { ActivityStatusBadge, Badge } from '@/components/ui/Badge';
import { daysUntil, formatDate, formatDateRange, windowState } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import type { TimelineRow } from '@/types/progress';
import type { StageJourney } from '@/services/ventures/mentorFeedbackService';

const EMPTY_JOURNEY: StageJourney = {
  presentations: [],
  feedback: { counted: 0, required: 1, complete: false, formConfigured: false },
};

type Phase = 'done' | 'current' | 'upcoming' | 'locked';

function phaseOf(row: TimelineRow, currentId: string | null): Phase {
  if (row.status === 'COMPLETED') return 'done';
  if (row.uiState === 'LOCKED') return 'locked';
  return row.recordId === currentId ? 'current' : 'upcoming';
}

/** "Opens in 3 days" / "5 days left" / "Closed" — relative to today. */
function windowText(row: TimelineRow, now: Date): string {
  const state = windowState(new Date(row.startDate), new Date(row.endDate), now);
  if (state === 'BEFORE') {
    const days = daysUntil(row.startDate, now);
    return days === 1 ? 'Opens tomorrow' : `Opens in ${days} days`;
  }
  if (state === 'OPEN') {
    const days = daysUntil(row.endDate, now);
    return days === 0 ? 'Last day' : days === 1 ? '1 day left' : `${days} days left`;
  }
  return 'Window closed';
}

/** The stage node on the rail: a tick when done, a lock when locked, else the code. */
function Node({ row, phase, size = 'md' }: { row: TimelineRow; phase: Phase; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'relative z-10 grid shrink-0 place-items-center rounded-full border-2 font-mono font-bold',
        size === 'md' ? 'size-10 text-[11px]' : 'size-8 text-[10px]',
        phase === 'done' && 'bg-success text-success-foreground border-success',
        phase === 'current' &&
          'bg-primary text-primary-foreground border-primary ring-primary/25 ring-4',
        phase === 'upcoming' && 'bg-surface-raised text-primary border-primary/50',
        phase === 'locked' && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {phase === 'done' ? (
        <Check
          className={size === 'md' ? 'size-4' : 'size-3.5'}
          strokeWidth={3}
          aria-hidden="true"
        />
      ) : phase === 'locked' ? (
        <Lock className="size-3.5" aria-hidden="true" />
      ) : (
        row.activityCode
      )}
    </span>
  );
}

/** One of the three things every stage asks for, with where it stands. */
function Checkpoint({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      {done ? (
        <span className="bg-success-soft text-success-soft-foreground mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full">
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <CircleDashed
          className="text-muted-foreground mt-0.5 size-4.5 shrink-0"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0">
        <span className={cn('block text-[13px] font-medium', !done && 'text-muted-foreground')}>
          {label}
        </span>
        <span className="type-caption block">{detail}</span>
      </span>
    </li>
  );
}

function presentationDetail(row: TimelineRow, journey: StageJourney): string {
  const live = journey.presentations.filter((p) => p.status !== 'CANCELLED');
  const received = live.find((p) => p.received);
  if (received) return `Received · ${formatDate(received.presentedOn)}`;
  if (row.presentationReceivedAt) return `Received · ${formatDate(row.presentationReceivedAt)}`;
  if (row.status === 'COMPLETED') return 'Received';
  const next = live[0];
  if (next)
    return `Scheduled · ${formatDate(next.presentedOn)}${next.startTime ? `, ${next.startTime}` : ''}`;
  return 'Date not set yet';
}

function feedbackDetail(presented: boolean, journey: StageJourney): string {
  const { counted, required, complete } = journey.feedback;
  if (complete) return `Complete · ${counted} response${counted === 1 ? '' : 's'}`;
  if (!presented) return 'After your presentation';
  return `${counted} of ${required} response${required === 1 ? '' : 's'}`;
}

/**
 * The student's whole programme as one path: every stage in order, where they
 * are on it, and — for each stage — the presentation, the mentor feedback and
 * the completion it needs.
 */
export function StageJourneyList({
  rows,
  journeys,
}: {
  rows: TimelineRow[];
  journeys: Record<string, StageJourney>;
}) {
  const now = new Date();
  const currentId = rows.find((r) => r.unlocked && r.status !== 'COMPLETED')?.recordId ?? null;

  return (
    <ol className="relative">
      {rows.map((row, index) => {
        const phase = phaseOf(row, currentId);
        const journey = journeys[row.recordId] ?? EMPTY_JOURNEY;
        const presented =
          row.presentationReceivedAt !== null ||
          row.status === 'COMPLETED' ||
          journey.presentations.some((p) => p.received);
        const last = index === rows.length - 1;
        const href = phase === 'locked' ? null : `/student/activities/${row.recordId}`;
        // Only the first locked stage says what unlocks it; repeating it on every
        // later one adds nothing.
        const firstLocked = phase === 'locked' && rows[index - 1]?.uiState !== 'LOCKED';

        return (
          <li key={row.recordId} className="relative flex gap-4 pb-5 last:pb-0">
            {/* The rail between this stage and the next: solid once this one is done. */}
            {!last ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-10 bottom-0 left-[19px] w-0.5',
                  phase === 'done' ? 'bg-success' : 'bg-border',
                )}
              />
            ) : null}

            <Node row={row} phase={phase} />

            <div
              className={cn(
                'rounded-control min-w-0 flex-1 border',
                phase === 'locked' ? 'px-4 py-3' : 'p-4',
                phase === 'current' && 'border-primary/60 bg-primary-soft/40 shadow-sm',
                phase === 'locked' && 'surface-sunken',
                phase !== 'current' && phase !== 'locked' && 'bg-surface-raised',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {phase === 'current' ? (
                    <p className="text-primary mb-1 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
                      <MapPin className="size-3" aria-hidden="true" />
                      You are here
                    </p>
                  ) : null}
                  <p className="text-[14.5px] font-semibold">
                    <span className="text-muted-foreground font-mono text-xs">
                      {row.activityCode}
                    </span>{' '}
                    {row.name}
                  </p>
                  <p className="type-caption mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{formatDateRange(row.startDate, row.endDate)}</span>
                    {phase === 'current' || phase === 'upcoming' ? (
                      <Badge
                        tone={
                          windowState(new Date(row.startDate), new Date(row.endDate), now) ===
                          'AFTER'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {windowText(row, now)}
                      </Badge>
                    ) : null}
                  </p>
                </div>
                <ActivityStatusBadge state={row.uiState} />
              </div>

              {phase === 'locked' ? (
                firstLocked ? (
                  <p className="type-secondary mt-2">
                    Unlocks when{' '}
                    {row.order <= 1 ? 'the programme starts' : 'the previous stage is completed'}.
                  </p>
                ) : null
              ) : (
                <>
                  <ol className="mt-3.5 grid gap-3 sm:grid-cols-3">
                    <Checkpoint
                      done={presented}
                      label="Presentation"
                      detail={presentationDetail(row, journey)}
                    />
                    <Checkpoint
                      done={journey.feedback.complete || row.status === 'COMPLETED'}
                      label="Mentor feedback"
                      detail={feedbackDetail(presented, journey)}
                    />
                    <Checkpoint
                      done={row.status === 'COMPLETED'}
                      label="Stage complete"
                      detail={
                        row.status === 'COMPLETED'
                          ? row.completedAt
                            ? formatDate(row.completedAt)
                            : 'Done'
                          : 'Once feedback is in'
                      }
                    />
                  </ol>
                  {href ? (
                    <Link
                      href={href}
                      className="text-primary mt-3.5 inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                    >
                      {phase === 'current' ? 'Open this stage' : 'View stage'}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The same path, compressed to one line of stage nodes for the dashboard —
 * scrolls sideways on a phone rather than wrapping.
 */
export function StageStrip({ rows }: { rows: TimelineRow[] }) {
  const currentId = rows.find((r) => r.unlocked && r.status !== 'COMPLETED')?.recordId ?? null;

  return (
    <div className="overflow-x-auto px-5 pt-2 pb-4">
      <ol className="flex min-w-max items-start">
        {rows.map((row, index) => {
          const phase = phaseOf(row, currentId);
          const href = phase === 'locked' ? null : `/student/activities/${row.recordId}`;
          const node = (
            <span className="flex w-24 flex-col items-center gap-1.5 text-center">
              <Node row={row} phase={phase} size="sm" />
              <span
                className={cn(
                  'line-clamp-2 text-[11.5px] leading-tight font-medium',
                  phase === 'locked' && 'text-muted-foreground',
                  phase === 'current' && 'text-primary',
                )}
              >
                {row.name}
              </span>
              <span className="type-caption text-[10.5px]">
                {phase === 'done'
                  ? 'Done'
                  : phase === 'current'
                    ? 'You are here'
                    : phase === 'locked'
                      ? 'Locked'
                      : formatDate(row.startDate)}
              </span>
            </span>
          );

          return (
            <li key={row.recordId} className="flex items-start">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-4 h-0.5 w-6 shrink-0 sm:w-10',
                    // Solid once the stage before it is done.
                    rows[index - 1]?.status === 'COMPLETED' ? 'bg-success' : 'bg-border',
                  )}
                />
              ) : null}
              {href ? (
                <Link
                  href={href}
                  className="rounded-control hover:bg-surface-hover py-1 transition-colors"
                >
                  {node}
                </Link>
              ) : (
                <span className="py-1">{node}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
