import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderOpen,
  HeartHandshake,
  Presentation,
  Timer,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, StatTile } from '@/components/ui/Card';
import { ActivityStatusBadge, Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { getActivityContext, getVentureProgress } from '@/services/ventures/studentVentureService';
import { getSubmissionHistory } from '@/services/submissions/submissionService';
import { getSupportActivitiesForVentureActivity } from '@/services/ventures/ventureActivityService';
import { toTimelineRow } from '@/services/ventures/timeline';
import { SubmissionHistory } from '@/components/venture/SubmissionHistory';
import { durationInDays, formatDate, formatDateRange, windowState } from '@/lib/utils/dates';
import { isValidObjectId } from '@/lib/utils/ids';
import { serialize } from '@/lib/utils/serialize';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

export default async function StudentActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const user = await requireRole('STUDENT');
  const context = await getActivityContext(id);

  // Ownership: a student may only open their own activity records.
  if (context.venture.studentId.toString() !== user.userId) forbidden();

  const progress = await getVentureProgress(context.venture._id.toString());
  const entry = progress.find((p) => p.recordId === id);
  if (!entry) notFound();

  const row = toTimelineRow(entry);

  const [history, supports] = await Promise.all([
    // Work submitted under the retired in-app flow. Shown when it exists so
    // nothing a student handed in, or any comment on it, disappears.
    getSubmissionHistory(id),
    getSupportActivitiesForVentureActivity(context.activity._id.toString()),
  ]);

  const start = context.activity.startDate;
  const end = context.activity.endDate;
  const window = windowState(start, end);

  // How far through the window we are — a schedule cue, not a progress bar for
  // the work itself.
  const totalDays = durationInDays(start, end);
  const elapsed = Math.min(Math.max(durationInDays(start, new Date()), 0), totalDays);

  const presented = row.presentationReceivedAt !== null || row.status === 'COMPLETED';

  return (
    <>
      <PageHeader
        eyebrow={`Activity ${row.activityCode}`}
        title={row.name}
        description={row.description || undefined}
        meta={
          <Badge
            tone={window === 'OPEN' ? 'success' : window === 'BEFORE' ? 'neutral' : 'warning'}
            icon={window === 'OPEN' ? CheckCircle2 : Timer}
          >
            {window === 'OPEN'
              ? 'Activity window open'
              : window === 'BEFORE'
                ? 'Window not open yet'
                : 'Window closed'}
          </Badge>
        }
        action={
          <Link
            href="/student"
            className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to timeline
          </Link>
        }
      />

      {/* What this stage asks of the student, stated once at the top: present,
          put the deck in the shared folder, then wait for feedback. */}
      <Card className="mb-5">
        <CardHeader
          title="Your presentation"
          description="Present your work for this stage and put your presentation in the shared Drive folder. The stage completes once you have been given feedback on it."
          icon={Presentation}
          action={<ActivityStatusBadge state={row.uiState} />}
        />
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-secondary flex items-start gap-2">
            {presented ? (
              <CheckCircle2
                className="text-success-soft-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {row.status === 'COMPLETED' ? (
                <>
                  <span className="text-foreground font-medium">Stage completed</span>
                  {row.completedAt ? ` on ${formatDate(row.completedAt)}` : ''}.
                </>
              ) : row.presentationReceivedAt ? (
                <>
                  <span className="text-foreground font-medium">Presentation received</span> on{' '}
                  {formatDate(row.presentationReceivedAt)}. Feedback is next.
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">Not received yet.</span> Your
                  programme office marks it received once your presentation is in the folder.
                </>
              )}
            </span>
          </p>

          {row.presentationFolderUrl ? (
            <a
              href={row.presentationFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <FolderOpen className="size-4" aria-hidden="true" />
              Open presentation folder
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="type-caption shrink-0">
              The folder link will appear here once it is shared.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Window" value={formatDateRange(row.startDate, row.endDate)} />
        <StatTile label="Duration" value={`${row.durationDays} days`} hint="Set on the activity" />
        <StatTile
          label="Presentation"
          value={presented ? 'Received' : 'Pending'}
          hint={
            row.presentationReceivedAt
              ? formatDate(row.presentationReceivedAt)
              : presented
                ? undefined
                : 'Not in the folder yet'
          }
          tone={presented ? 'positive' : 'neutral'}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Schedule"
            description="Where today sits in this activity's window."
            icon={CalendarRange}
          />
          <CardBody className="space-y-2.5">
            <MeterBar
              value={window === 'AFTER' ? totalDays : elapsed}
              max={totalDays}
              tone={window === 'AFTER' ? 'danger' : window === 'OPEN' ? 'primary' : 'neutral'}
              label="Window elapsed"
            />
            <dl className="type-secondary grid grid-cols-2 gap-2">
              <div>
                <dt className="type-overline">Opens</dt>
                <dd className="text-foreground mt-0.5 font-medium">{formatDate(start)}</dd>
              </div>
              <div>
                <dt className="type-overline">Closes</dt>
                <dd className="text-foreground mt-0.5 font-medium">{formatDate(end)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Required support activities"
            description="These feed this stage of your venture."
            icon={HeartHandshake}
          />
          {supports.length === 0 ? (
            <EmptyState
              size="sm"
              title="Nothing mapped"
              description="No support activities are linked to this stage."
            />
          ) : (
            <CardBody>
              <ul className="space-y-2">
                {supports.map((support) => (
                  <li
                    key={support._id.toString()}
                    className="surface-sunken rounded-control border px-3 py-2"
                  >
                    <p className="text-[13px] font-medium">
                      <span className="font-mono text-xs">{support.activityCode}</span>{' '}
                      {support.name}
                    </p>
                    {support.description ? (
                      <p className="type-caption mt-0.5">{support.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>

      {history.length > 0 ? (
        <div className="mt-5">
          <SubmissionHistory
            entries={serialize(history)}
            emptyMessage="Nothing was submitted for this activity."
          />
        </div>
      ) : null}
    </>
  );
}
