import { CheckCircle2, CircleSlash, Clock, Lock, OctagonAlert, RotateCcw } from 'lucide-react';
import { ActivityStatusBadge, ReviewStatusBadge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import type { ReviewStatus, UiActivityState } from '@/lib/constants/status';

/**
 * The dual-review rule, made visible.
 *
 * An activity completes only when *both* the faculty and the mentor approve.
 * That rule is enforced on the server, but it is the single thing users most
 * often misread — a student sees one green tick and assumes they are done. So
 * the two verdicts are always shown side by side, joined by an explicit "and",
 * with the resulting overall state stated underneath rather than inferred.
 */

const VERDICT_ICON: Record<ReviewStatus, typeof Clock> = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REVISION_REQUIRED: RotateCcw,
  REJECTED: CircleSlash,
};

const VERDICT_STYLE: Record<ReviewStatus, string> = {
  PENDING: 'border-border bg-muted text-muted-foreground',
  APPROVED: 'border-success-border bg-success-soft text-success-soft-foreground',
  REVISION_REQUIRED: 'border-warning-border bg-warning-soft text-warning-soft-foreground',
  REJECTED: 'border-danger-border bg-danger-soft text-danger-soft-foreground',
};

const VERDICT_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision required',
  REJECTED: 'Rejected',
};

function Verdict({ role, status }: { role: 'Faculty' | 'Mentor'; status: ReviewStatus }) {
  const Icon = VERDICT_ICON[status];

  return (
    <div className={cn('rounded-control flex-1 border px-3 py-2.5', VERDICT_STYLE[status])}>
      <p className="text-[11px] font-semibold tracking-[0.06em] uppercase">{role} review</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {VERDICT_LABEL[status]}
      </p>
    </div>
  );
}

const OVERALL_NOTE: Record<UiActivityState, string> = {
  LOCKED: 'Earlier activities must be completed first.',
  NOT_STARTED: 'No attempt has been submitted yet.',
  IN_PROGRESS: 'Work in progress — nothing submitted for review yet.',
  UNDER_REVIEW: 'Both approvals are required before this activity completes.',
  REVISION_REQUIRED: 'A reviewer asked for changes. Submit a revised attempt.',
  COMPLETED: 'Both reviewers approved this attempt.',
  MAX_ATTEMPTS_REACHED: 'No attempts remain. An administrator must intervene.',
};

export function DualReviewPanel({
  facultyStatus,
  mentorStatus,
  overall,
  className,
}: {
  facultyStatus: ReviewStatus;
  mentorStatus: ReviewStatus;
  overall: UiActivityState;
  className?: string;
}) {
  return (
    <div className={cn('surface-sunken rounded-card border p-3', className)}>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Verdict role="Faculty" status={facultyStatus} />
        <span
          className="text-muted-foreground shrink-0 self-center text-[11px] font-semibold tracking-[0.08em] uppercase"
          aria-hidden="true"
        >
          and
        </span>
        <Verdict role="Mentor" status={mentorStatus} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t pt-3">
        <span className="type-overline">Overall</span>
        <ActivityStatusBadge state={overall} />
        <span className="type-caption min-w-0 flex-1">{OVERALL_NOTE[overall]}</span>
      </div>
    </div>
  );
}

/** The same information at row scale, for tables and lists. */
export function DualReviewInline({
  facultyStatus,
  mentorStatus,
}: {
  facultyStatus: ReviewStatus;
  mentorStatus: ReviewStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ReviewStatusBadge status={facultyStatus} prefix="Faculty" />
      <ReviewStatusBadge status={mentorStatus} prefix="Mentor" />
    </div>
  );
}

/**
 * Attempts used against the configured maximum.
 *
 * `maxAttempts` is a property of the activity, so it is always read from the
 * record rather than assumed — the default happens to be 3, but nothing here
 * depends on that.
 */
export function AttemptMeter({
  used,
  max,
  className,
}: {
  used: number;
  max: number;
  className?: string;
}) {
  const exhausted = used >= max;
  const last = !exhausted && used === max - 1;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: max }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 w-5 rounded-full',
              index < used ? (exhausted ? 'bg-danger' : 'bg-chart-1') : 'bg-chart-track',
            )}
          />
        ))}
      </span>

      <span
        className={cn(
          'text-[13px] font-medium',
          exhausted ? 'text-danger-soft-foreground' : last ? 'text-warning-soft-foreground' : '',
        )}
      >
        {exhausted ? (
          <span className="inline-flex items-center gap-1">
            <OctagonAlert className="size-3.5" aria-hidden="true" />
            Maximum attempts reached
          </span>
        ) : (
          `Attempt ${used + 1} of ${max}`
        )}
      </span>

      {last ? (
        <span className="type-caption">Final attempt — no further submissions after this.</span>
      ) : null}
    </div>
  );
}

/** Locked-state explainer, so a disabled activity says why it is disabled. */
export function LockedNotice({ reason }: { reason?: string }) {
  return (
    <p className="type-secondary flex items-start gap-1.5">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{reason ?? 'Complete the preceding activity to unlock this one.'}</span>
    </p>
  );
}
