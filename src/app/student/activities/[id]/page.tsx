import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  HeartHandshake,
  MessagesSquare,
  Presentation,
  Timer,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, StatTile } from '@/components/ui/Card';
import { ActivityStatusBadge, Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { getActivityContext, getVentureProgress } from '@/services/ventures/studentVentureService';
import { getSupportActivitiesForVentureActivity } from '@/services/ventures/ventureActivityService';
import { toTimelineRow } from '@/services/ventures/timeline';
import { BehaviourFeedbackCard } from '@/components/venture/BehaviourFeedbackCard';
import { getBehaviourFeedbackForRecord } from '@/services/ventures/behaviourService';
import { getStudentMentorFeedback } from '@/services/ventures/mentorFeedbackService';
import { MentorFeedbackEntries } from '@/components/venture/MentorFeedbackEntries';
import { durationInDays, formatDate, formatDateRange, windowState } from '@/lib/utils/dates';
import { isValidObjectId } from '@/lib/utils/ids';

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

  // Ownership was checked above; `id` is this student's own record, so the
  // feedback read below can only ever be theirs.
  const [supports, behaviour, mentorFeedback] = await Promise.all([
    getSupportActivitiesForVentureActivity(context.activity._id.toString()),
    getBehaviourFeedbackForRecord(id),
    getStudentMentorFeedback(id),
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
            href="/student/timeline"
            className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to timeline
          </Link>
        }
      />

      {/* What this stage asks of the student, stated once at the top: present,
          then wait for feedback. */}
      <Card className="mb-5">
        <CardHeader
          title="Your presentation"
          description="Present your work for this stage. The stage completes once you have been given feedback on a presentation."
          icon={Presentation}
          action={<ActivityStatusBadge state={row.uiState} />}
        />
        <CardBody className="space-y-4">
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
                  {formatDate(row.presentationReceivedAt)}.{' '}
                  {mentorFeedback.complete
                    ? 'Mentor feedback is complete.'
                    : 'The stage completes once mentor feedback is in.'}
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">Not received yet.</span> Your
                  programme office marks it received once you have presented.
                </>
              )}
            </span>
          </p>

          {mentorFeedback.presentations.length > 0 ? (
            <ul className="divide-border rounded-control divide-y border">
              {mentorFeedback.presentations.map((presentation) => (
                <li
                  key={presentation.participantId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5"
                >
                  <CalendarDays
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                    {formatDate(presentation.presentedOn)}
                    {presentation.startTime ? (
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        · {presentation.startTime}
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    tone={
                      presentation.status === 'CANCELLED'
                        ? 'muted'
                        : presentation.received
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {presentation.status === 'CANCELLED'
                      ? 'Cancelled'
                      : presentation.received
                        ? 'Received'
                        : presentation.status === 'SCHEDULED'
                          ? 'Scheduled'
                          : 'Not received'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-caption">
              Your presentation date will appear here once it is scheduled.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Window" value={formatDateRange(row.startDate, row.endDate)} />
        <StatTile label="Duration" value={`${row.durationDays} days`} hint="Set on the activity" />
        {/* Feedback only exists for a received presentation; before that there
            is nothing to count, so the tile says so rather than showing 0. */}
        <StatTile
          label="Mentor feedback"
          value={
            !presented
              ? 'After presentation'
              : mentorFeedback.complete
                ? 'Complete'
                : `${mentorFeedback.counted} of ${mentorFeedback.required}`
          }
          hint={
            !presented
              ? undefined
              : mentorFeedback.complete
                ? `${mentorFeedback.counted} response(s) received`
                : 'Responses received'
          }
          tone={mentorFeedback.complete ? 'positive' : 'neutral'}
        />
        <StatTile
          label="Presentation"
          value={presented ? 'Received' : 'Pending'}
          hint={
            row.presentationReceivedAt
              ? formatDate(row.presentationReceivedAt)
              : presented
                ? undefined
                : 'Not received yet'
          }
          tone={presented ? 'positive' : 'neutral'}
        />
      </div>

      {presented ? (
        <Card className="mt-5">
          <CardHeader
            title="Mentor feedback"
            description="Feedback from faculty and mentors on your presentations for this stage."
            icon={MessagesSquare}
            action={
              mentorFeedback.complete ? (
                <Badge tone="success" icon={CheckCircle2}>
                  Feedback complete
                </Badge>
              ) : (
                <Badge tone="neutral">
                  {mentorFeedback.counted} of {mentorFeedback.required} received
                </Badge>
              )
            }
          />
          {mentorFeedback.counted === 0 ? (
            <EmptyState
              size="sm"
              title="No feedback yet"
              description="Feedback appears here as soon as a mentor submits it."
            />
          ) : (
            <CardBody className="space-y-5">
              {/* Feedback belongs to one presentation; a student who presented
                  more than once sees each presentation's feedback on its own. */}
              {mentorFeedback.presentations
                .filter((presentation) => presentation.entries.length > 0)
                .map((presentation) => (
                  <section key={presentation.participantId} className="space-y-2">
                    <h3 className="type-overline flex flex-wrap items-center gap-2">
                      Presentation on {formatDate(presentation.presentedOn)}
                      {presentation.complete ? (
                        <Badge tone="success" icon={CheckCircle2}>
                          Complete
                        </Badge>
                      ) : null}
                    </h3>
                    <MentorFeedbackEntries entries={presentation.entries} />
                  </section>
                ))}
              {mentorFeedback.earlierEntries.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="type-overline">Earlier feedback</h3>
                  <MentorFeedbackEntries entries={mentorFeedback.earlierEntries} />
                </section>
              ) : null}
            </CardBody>
          )}
        </Card>
      ) : null}

      <div className="mt-5">
        <BehaviourFeedbackCard feedback={behaviour} />
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
    </>
  );
}
