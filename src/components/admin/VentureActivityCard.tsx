import Link from 'next/link';
import { CalendarRange, FolderOpen, Layers, Presentation } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { PRESENTATION_STAGE_LABELS, type PresentationStageState } from '@/lib/rules/presentations';

const STAGE_TONE: Record<PresentationStageState, 'muted' | 'info' | 'warning' | 'success'> = {
  NO_STUDENTS: 'muted',
  COLLECTING: 'warning',
  AWAITING_FEEDBACK: 'info',
  COMPLETED: 'success',
};

export interface VentureActivityView {
  id: string;
  activityCode: string;
  name: string;
  termName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  /** The stage's shared Drive folder for presentations, if set. */
  presentationFolderUrl: string | null;
  /** Students whose presentation is confirmed in the folder. */
  presentationsReceived: number;
  presentationStage: PresentationStageState;
  /** Students who have HR & behaviour feedback on this stage. */
  behaviourGiven: number;
  /** Mentor feedback complete, out of received presentations only. */
  mentorFeedback: { received: number; complete: number; configured: boolean };
  status: string;
  supportCodes: string[];
  /** Cohort progress; null when no student has reached this activity yet. */
  completed: number;
  total: number;
  /** Attendance across every date a register has been taken on. */
  attendance: { present: number; absent: number; sessions: number; records: number };
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
 * Every figure is read from the record — duration is per-activity
 * configuration, so nothing here assumes the usual 12–15 days.
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
              <Presentation className="size-3" aria-hidden="true" />
              Presentations
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium tabular-nums">
              {activity.total > 0 ? (
                `${activity.presentationsReceived}/${activity.total} received`
              ) : (
                <span className="text-muted-foreground">No students yet</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="type-overline flex items-center gap-1">
              <FolderOpen className="size-3" aria-hidden="true" />
              Drive folder
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium">
              {activity.presentationFolderUrl ? (
                <a
                  href={activity.presentationFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open folder
                </a>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </dd>
          </div>
        </dl>

        {/* The stage completes on presentations plus feedback — stated on each
            card so nobody reads "all received" as "done". */}
        <div className="surface-sunken rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2">
          <span className="type-overline">Stage</span>
          <Badge tone={STAGE_TONE[activity.presentationStage]}>
            {PRESENTATION_STAGE_LABELS[activity.presentationStage]}
          </Badge>
          {activity.total > 0 ? (
            <span className="type-caption ml-auto tabular-nums">
              {activity.mentorFeedback.configured
                ? `Feedback ${activity.mentorFeedback.complete}/${activity.mentorFeedback.received} · `
                : 'No feedback form · '}
              HR {activity.behaviourGiven}/{activity.total}
            </span>
          ) : null}
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
        {activity.attendance.records > 0 ? (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="type-overline">Attendance</span>
              <span className="type-caption tabular-nums">
                {activity.attendance.present}/{activity.attendance.records} present
              </span>
            </div>
            {/* Measured against the marks that exist, not against the cohort:
                a register nobody has taken yet is not 0% attendance. */}
            <MeterBar
              value={activity.attendance.present}
              max={Math.max(1, activity.attendance.records)}
              size="sm"
              tone={activity.attendance.absent === 0 ? 'success' : 'warning'}
              label={`${activity.activityCode} attendance`}
            />
            <p className="type-caption mt-1">
              Across {activity.attendance.sessions} recorded date
              {activity.attendance.sessions === 1 ? '' : 's'}
            </p>
          </div>
        ) : null}
      </div>

      <footer className="surface-sunken flex items-center justify-end gap-3 border-t px-4 py-2">
        {/* Attendance is its own register now; this opens it pre-filtered to
            this activity, which is the view that used to live on this card. */}
        <Link
          href={`/admin/attendance?ventureActivityId=${activity.id}`}
          className="text-primary text-[13px] font-medium hover:underline"
        >
          Attendance
        </Link>
        <Link
          href={`/admin/venture-activities/${activity.id}`}
          className="text-primary text-[13px] font-medium hover:underline"
        >
          Presentations &amp; settings
        </Link>
      </footer>
    </article>
  );
}
