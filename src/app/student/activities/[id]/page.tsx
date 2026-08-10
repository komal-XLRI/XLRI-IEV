import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { ArrowLeft, CalendarRange, CheckCircle2, HeartHandshake, Timer } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, StatTile } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { AttemptMeter, DualReviewPanel } from '@/components/venture/ReviewProgress';
import { getActivityContext, getVentureProgress } from '@/services/ventures/studentVentureService';
import { getSubmissionHistory } from '@/services/submissions/submissionService';
import { listDraftEvidence } from '@/services/evidence/evidenceService';
import { getSupportActivitiesForVentureActivity } from '@/services/ventures/ventureActivityService';
import { toTimelineRow } from '@/services/ventures/timeline';
import { SubmissionPanel } from '@/components/student/SubmissionPanel';
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

  const [history, supports, draftEvidence] = await Promise.all([
    getSubmissionHistory(id),
    getSupportActivitiesForVentureActivity(context.activity._id.toString()),
    // Files staged for the *next* attempt. Rendered on the server so a student
    // who uploads and then closes the tab finds their evidence still attached.
    listDraftEvidence(id),
  ]);

  const start = context.activity.startDate;
  const end = context.activity.endDate;
  const window = windowState(start, end);

  // How far through the window we are — a schedule cue, not a progress bar for
  // the work itself.
  const totalDays = durationInDays(start, end);
  const elapsed = Math.min(Math.max(durationInDays(start, new Date()), 0), totalDays);

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
              ? 'Submission window open'
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

      {/* The two rules that decide what a student can do next, stated once, at
          the top: who must approve, and how many attempts are left. */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <DualReviewPanel
          facultyStatus={row.facultyReviewStatus}
          mentorStatus={row.mentorReviewStatus}
          overall={row.uiState}
        />

        <div className="surface-card rounded-card flex flex-col justify-center gap-2.5 px-4 py-3">
          <span className="type-overline">Attempts</span>
          <AttemptMeter used={row.attemptsUsed} max={row.maxAttempts} />
          {row.blockedReason ? (
            <p className="type-caption">{row.blockedReason}</p>
          ) : (
            <p className="type-caption">
              Every attempt and every comment is kept — nothing is overwritten.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Window" value={formatDateRange(row.startDate, row.endDate)} />
        <StatTile label="Duration" value={`${row.durationDays} days`} hint="Set on the activity" />
        <StatTile
          label="Attempts remaining"
          value={row.attemptsRemaining}
          hint={`${row.attemptsUsed} of ${row.maxAttempts} used`}
          tone={
            row.attemptsRemaining === 0
              ? 'danger'
              : row.attemptsRemaining === 1
                ? 'warning'
                : 'neutral'
          }
        />
        <StatTile
          label="Evidence"
          value={row.evidenceRequired ? 'Required' : 'Optional'}
          hint={row.evidenceRequired ? 'Attach before submitting' : 'Attach if it helps'}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <SubmissionPanel row={serialize(row)} draftEvidence={serialize(draftEvidence)} />
          <SubmissionHistory
            entries={serialize(history)}
            emptyMessage="You have not submitted anything for this activity yet."
          />
        </div>

        <div className="space-y-5">
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
              <p className="type-caption">
                The window is advisory — a late submission is still accepted and still needs both
                approvals.
              </p>
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

          {row.completedAt ? (
            <Card>
              <CardBody className="flex items-start gap-2.5">
                <span className="bg-success-soft text-success-soft-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
                <p className="type-secondary">
                  <span className="text-foreground font-medium">Completed</span> on{' '}
                  {formatDate(row.completedAt)}, once both your faculty reviewer and your industry
                  mentor approved the same attempt.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
