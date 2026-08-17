import Link from 'next/link';
import { CalendarRange, CheckCircle2, Layers, Paperclip, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';

export interface VentureActivityView {
  id: string;
  activityCode: string;
  name: string;
  termName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  maxAttempts: number;
  evidenceRequired: boolean;
  status: string;
  supportCodes: string[];
  /** Cohort progress; null when no student has reached this activity yet. */
  completed: number;
  total: number;
  /** Attendance across the cohort for this activity. */
  attendance: { present: number; absent: number; pending: number; total: number };
  /** 'OPEN' | 'BEFORE' | 'AFTER' | null when no window is configured. */
  windowState: 'OPEN' | 'BEFORE' | 'AFTER' | null;
}

const WINDOW_BADGE = {
  OPEN: { tone: 'success', label: 'Window open' },
  BEFORE: { tone: 'info', label: 'Opens later' },
  AFTER: { tone: 'muted', label: 'Window closed' },
} as const;

/**
 * One Venture Activity, laid out so the whole definition can be read without
 * scrolling a table sideways.
 *
 * Every figure is read from the record — duration and the attempt limit are
 * per-activity configuration, so nothing here assumes the usual 12–15 days or
 * three attempts.
 */
export function VentureActivityCard({ activity }: { activity: VentureActivityView }) {
  const window = activity.windowState ? WINDOW_BADGE[activity.windowState] : null;
  const inactive = activity.status !== 'ACTIVE';

  return (
    <article
      className={cn(
        'surface-card rounded-card flex flex-col transition-colors',
        // A sunken fill rather than `opacity-70`: dimming the whole card takes
        // its text down with it, and "deactivated" is already stated by the
        // badge. The recessed surface is the visual cue; nothing loses contrast.
        inactive && 'bg-surface-sunken',
      )}
    >
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold">
          {activity.activityCode}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] leading-5 font-semibold">{activity.name}</h3>
          <p className="type-caption truncate">{activity.termName ?? 'No term assigned'}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {window ? <Badge tone={window.tone}>{window.label}</Badge> : null}
          {inactive ? <Badge tone="muted">Inactive</Badge> : null}
        </div>
      </header>

      <div className="flex-1 space-y-3 px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <dt className="type-overline flex items-center gap-1">
              <CalendarRange className="size-3" aria-hidden="true" />
              Window
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium">
              {activity.startDate && activity.endDate ? (
                <>
                  {formatDate(activity.startDate)}
                  <span className="text-muted-foreground"> → </span>
                  {formatDate(activity.endDate)}
                </>
              ) : (
                <span className="text-muted-foreground">Not scheduled</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="type-overline flex items-center gap-1">
              <Layers className="size-3" aria-hidden="true" />
              Duration
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium tabular-nums">
              {activity.durationDays} days
            </dd>
          </div>

          <div>
            <dt className="type-overline flex items-center gap-1">
              <RefreshCw className="size-3" aria-hidden="true" />
              Maximum attempts
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium tabular-nums">{activity.maxAttempts}</dd>
          </div>

          <div>
            <dt className="type-overline flex items-center gap-1">
              <Paperclip className="size-3" aria-hidden="true" />
              Evidence
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium">
              {activity.evidenceRequired ? 'Required' : 'Optional'}
            </dd>
          </div>
        </dl>

        {/* Both approvals are mandatory for every activity — stating it on each
            card is cheaper than a reader inferring it from the review screens. */}
        <div className="surface-sunken rounded-control flex flex-wrap items-center gap-x-4 gap-y-1 border px-3 py-2">
          <span className="type-overline">Review</span>
          <span className="text-success-soft-foreground inline-flex items-center gap-1 text-[12.5px] font-medium">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Faculty required
          </span>
          <span className="text-success-soft-foreground inline-flex items-center gap-1 text-[12.5px] font-medium">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Mentor required
          </span>
        </div>

        <div>
          <p className="type-overline mb-1">Required support activities</p>
          {activity.supportCodes.length === 0 ? (
            <p className="type-caption">None mapped</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {activity.supportCodes.map((code) => (
                <li key={code}>
                  <Badge tone="neutral" className="font-mono">
                    {code}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activity.total > 0 ? (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="type-overline">Cohort completion</span>
              <span className="type-caption tabular-nums">
                {activity.completed}/{activity.total}
              </span>
            </div>
            <MeterBar
              value={activity.completed}
              max={activity.total}
              size="sm"
              tone={activity.completed === activity.total ? 'success' : 'primary'}
              label={`${activity.activityCode} completion`}
            />
          </div>
        ) : null}
        {activity.attendance.total > 0 ? (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="type-overline">Attendance</span>
              <span className="type-caption tabular-nums">
                {activity.attendance.present}/{activity.attendance.total} present
              </span>
            </div>
            {/* Measured against how many have been *marked*, not the cohort:
                a register nobody has filled in yet is not 0% attendance. */}
            <MeterBar
              value={activity.attendance.present}
              max={Math.max(1, activity.attendance.present + activity.attendance.absent)}
              size="sm"
              tone={activity.attendance.absent === 0 ? 'success' : 'warning'}
              label={`${activity.activityCode} attendance`}
            />
            {activity.attendance.pending > 0 ? (
              <p className="type-caption mt-1">
                {activity.attendance.pending} not yet marked
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="surface-sunken flex items-center justify-end gap-3 border-t px-4 py-2">
        <Link
          href={`/admin/venture-activities/${activity.id}#attendance`}
          className="text-primary text-[13px] font-medium hover:underline"
        >
          Attendance
        </Link>
        <Link
          href={`/admin/venture-activities/${activity.id}`}
          className="text-primary text-[13px] font-medium hover:underline"
        >
          Edit activity
        </Link>
      </footer>
    </article>
  );
}
