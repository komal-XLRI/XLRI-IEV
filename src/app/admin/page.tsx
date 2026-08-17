import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  OctagonAlert,
  RotateCcw,
  UserCheck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  KpiCard,
  Section,
} from '@/components/ui/Card';
import { BarList, StackedBar } from '@/components/ui/Chart';
import { Badge } from '@/components/ui/Badge';
import { DualReviewInline } from '@/components/venture/ReviewProgress';
import { getActivityCompletionReport, getAdminOverview } from '@/services/reports/reportService';
import {
  countPendingReviewAttempts,
  getActivityCalendar,
  getPendingReviewAttempts,
  getReviewQueueSummary,
} from '@/services/dashboard/dashboardService';
import { formatDate, formatDateRange, windowState } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Programme overview' };
export const dynamic = 'force-dynamic';

const PENDING_PREVIEW = 6;
const UPCOMING_PREVIEW = 5;

export default async function AdminDashboardPage() {
  // Everything the page needs, fetched together rather than in a waterfall.
  const [overview, reviewerLoad, activities, calendar, pending, pendingTotal] = await Promise.all([
    getAdminOverview(),
    getReviewQueueSummary(),
    getActivityCompletionReport(),
    getActivityCalendar(),
    getPendingReviewAttempts(PENDING_PREVIEW),
    countPendingReviewAttempts(),
  ]);

  // The activity records roll up to the venture-level distribution, so the two
  // panels are always consistent with each other by construction.
  const totals = activities.reduce(
    (running, row) => ({
      notStarted: running.notStarted + row.notStarted,
      inProgress: running.inProgress + row.inProgress,
      underReview: running.underReview + row.underReview,
      revisionRequired: running.revisionRequired + row.revisionRequired,
      completed: running.completed + row.completed,
      maxAttemptsReached: running.maxAttemptsReached + row.maxAttemptsReached,
    }),
    {
      notStarted: 0,
      inProgress: 0,
      underReview: 0,
      revisionRequired: 0,
      completed: 0,
      maxAttemptsReached: 0,
    },
  );

  const trackedActivities = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const overallCompletion =
    trackedActivities === 0 ? 0 : Math.round((totals.completed / trackedActivities) * 100);

  const now = new Date();
  const upcoming = calendar
    .map((activity) => ({
      activity,
      state:
        activity.startDate && activity.endDate
          ? windowState(activity.startDate, activity.endDate, now)
          : null,
    }))
    .filter((entry) => entry.state === 'OPEN' || entry.state === 'BEFORE')
    .slice(0, UPCOMING_PREVIEW);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="IEV Programme"
        title="Programme overview"
        description="Monitor student ventures, activities, reviews and programme progress."
        meta={
          <Badge tone="info" icon={Activity}>
            {overallCompletion}% of tracked activities complete
          </Badge>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Row 1 — who is in the programme                                   */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Participation" description="People and ventures currently on the programme.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Students"
            value={overview.totalStudents}
            hint="Active accounts"
            icon={Users}
            tone="primary"
            href="/admin/students"
          />
          <KpiCard
            label="Active ventures"
            value={overview.activeVentures}
            hint={`${overview.totalVentures} in total`}
            icon={Briefcase}
            tone="primary"
            href="/admin/ventures"
          />
          <KpiCard
            label="Faculty"
            value={overview.facultyCount}
            hint="Venture reviewers"
            icon={GraduationCap}
            href="/admin/faculty"
          />
          <KpiCard
            label="Mentors"
            value={overview.mentorCount}
            hint="Industry reviewers"
            icon={UserCheck}
            href="/admin/mentors"
          />
          <KpiCard
            label="Unassigned ventures"
            value={overview.unassignedVentures}
            hint={
              overview.unassignedVentures > 0
                ? 'Missing a faculty or a mentor'
                : 'Every venture has both reviewers'
            }
            icon={overview.unassignedVentures > 0 ? AlertTriangle : CheckCircle2}
            tone={overview.unassignedVentures > 0 ? 'warning' : 'positive'}
            href="/admin/ventures"
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Row 2 — where the work stands                                     */}
      {/* ---------------------------------------------------------------- */}
      <Section
        title="Activity status"
        description="Across every student's Venture Activity records."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Completed activities"
            value={overview.completedActivities}
            hint="Both reviewers approved"
            icon={CheckCircle2}
            tone="positive"
          />
          <KpiCard
            label="Under review"
            value={overview.underReview}
            hint="Awaiting one or both verdicts"
            icon={ClipboardCheck}
            tone="warning"
            href="/admin/reviews"
          />
          <KpiCard
            label="Revision required"
            value={overview.revisionRequired}
            hint="Sent back to the student"
            icon={RotateCcw}
            tone="warning"
            href="/admin/reviews?reviewStatus=REVISION_REQUIRED"
          />
          <KpiCard
            label="Max attempts reached"
            value={overview.maxAttemptsReached}
            hint={
              overview.maxAttemptsReached > 0
                ? 'Blocked until the limit is raised'
                : 'Nobody is blocked'
            }
            icon={overview.maxAttemptsReached > 0 ? OctagonAlert : CheckCircle2}
            tone={overview.maxAttemptsReached > 0 ? 'danger' : 'positive'}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Distribution + per-activity completion                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Venture progress"
            description="How the whole cohort's activity records are distributed."
            icon={Activity}
          />
          <CardBody>
            {trackedActivities === 0 ? (
              <EmptyState
                size="sm"
                title="No activity records yet"
                description="Records appear once a venture is created and its activities are laid out."
              />
            ) : (
              <StackedBar
                caption="Distribution of activity records by status"
                segments={[
                  { label: 'Not started', value: totals.notStarted, tone: 'neutral' },
                  { label: 'In progress', value: totals.inProgress, tone: 'primary' },
                  { label: 'Under review', value: totals.underReview, tone: 'warning' },
                  { label: 'Revision required', value: totals.revisionRequired, tone: 'warning' },
                  { label: 'Completed', value: totals.completed, tone: 'success' },
                  {
                    label: 'Max attempts reached',
                    value: totals.maxAttemptsReached,
                    tone: 'danger',
                  },
                ]}
              />
            )}
          </CardBody>
          {trackedActivities > 0 ? (
            <CardFooter>
              <span className="text-muted-foreground">
                {trackedActivities} activity record(s) tracked
              </span>
            </CardFooter>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Activity progress"
            description="Completion across the Venture Activities, in programme order."
            icon={Briefcase}
            action={
              <Link
                href="/admin/venture-activities"
                className="text-primary text-[13px] font-medium hover:underline"
              >
                Manage activities
              </Link>
            }
          />

          {activities.length === 0 ? (
            <EmptyState
              size="sm"
              title="No Venture Activities configured"
              description="Add the programme's activities to see completion here."
              action={
                <Link
                  href="/admin/venture-activities"
                  className="text-primary text-[13px] font-medium hover:underline"
                >
                  Configure activities
                </Link>
              }
            />
          ) : (
            <BarList
              items={activities.map((row) => ({
                id: row.activityCode,
                label: `${row.activityCode} · ${row.name}`,
                sublabel: row.termName ?? undefined,
                value: row.completed,
                max: row.total,
                tone:
                  row.total === 0 ? 'neutral' : row.completed === row.total ? 'success' : 'primary',
                meta: `${row.completed}/${row.total}`,
              }))}
            />
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Pending reviews                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Pending reviews"
          description="An activity completes only when both the faculty and the mentor have approved."
          icon={ClipboardCheck}
          action={
            <Link
              href="/admin/reviews"
              className="text-primary text-[13px] font-medium hover:underline"
            >
              View all reviews
            </Link>
          }
        />

        {pending.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            size="sm"
            title="No pending reviews"
            description="All submitted activities have been reviewed. You're all caught up."
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <caption className="sr-only">Attempts awaiting a review verdict</caption>
              <thead>
                <tr>
                  {['Student', 'Venture', 'Activity', 'Reviews', 'Waiting since', ''].map(
                    (header, index) => (
                      <th
                        key={header || index}
                        scope="col"
                        className="bg-table-header text-table-header-foreground border-b px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr
                    key={row.recordId}
                    className="hover:bg-table-row-hover border-b transition-colors last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-medium">{row.studentName}</td>
                    <td className="text-muted-foreground px-4 py-2.5">{row.ventureName}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold">{row.activityCode}</span>{' '}
                      <span className="text-muted-foreground">{row.activityName}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DualReviewInline
                        facultyStatus={row.facultyReviewStatus}
                        mentorStatus={row.mentorReviewStatus}
                      />
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {formatDate(row.awaitingSince)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link
                        href="/admin/reviews"
                        className="text-primary text-[13px] font-medium hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingTotal > PENDING_PREVIEW ? (
          <CardFooter>
            <span className="text-muted-foreground">
              Showing {PENDING_PREVIEW} of {pendingTotal} awaiting a verdict.
            </span>
            <Link
              href="/admin/reviews"
              className="text-primary ml-auto font-medium hover:underline"
            >
              See the rest
            </Link>
          </CardFooter>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Reviewer load + activity windows                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Reviewers with pending work"
            description="Who still owes a verdict, and how many."
            icon={UserCheck}
          />
          {reviewerLoad.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              size="sm"
              title="Every reviewer is clear"
              description="No faculty member or mentor has an outstanding verdict."
            />
          ) : (
            <ul className="divide-border divide-y">
              {reviewerLoad.map((row) => (
                <li
                  key={`${row.reviewerId}:${row.reviewerType}`}
                  className="flex items-center gap-3 px-5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {row.reviewerName}
                  </span>
                  <Badge tone={row.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
                    {row.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                  </Badge>
                  <span className="w-8 text-right text-[13.5px] font-semibold tabular-nums">
                    {row.pending}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Active and upcoming activities"
            description="Submission windows that are open now or opening next."
            icon={CalendarClock}
          />
          {upcoming.length === 0 ? (
            <EmptyState
              size="sm"
              title="No open or upcoming windows"
              description="Every configured activity window has already closed."
            />
          ) : (
            <ul className="divide-border divide-y">
              {upcoming.map(({ activity, state }) => (
                <li key={String(activity._id)} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      <span className="font-mono text-xs font-semibold">
                        {activity.activityCode}
                      </span>{' '}
                      {activity.name}
                    </span>
                    <span className="type-caption">
                      {formatDateRange(activity.startDate, activity.endDate)} ·{' '}
                      {activity.durationDays} days · max {activity.maxAttempts} attempts
                    </span>
                  </span>
                  <Badge tone={state === 'OPEN' ? 'success' : 'neutral'}>
                    {state === 'OPEN' ? 'Open now' : 'Upcoming'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
