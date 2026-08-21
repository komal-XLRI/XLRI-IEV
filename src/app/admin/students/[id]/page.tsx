import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Activity,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  HeartHandshake,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard, Section } from '@/components/ui/Card';
import { Badge, ReviewStatusBadge } from '@/components/ui/Badge';
import { ActivityTimeline, ProgressBar } from '@/components/venture/ActivityTimeline';
import { ExportMenu } from '@/components/export/ExportMenu';
import { getStudentDossier } from '@/services/students/studentDossier';
import { toTimeline } from '@/services/ventures/timeline';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { humanise } from '@/lib/utils/humanise';
import { isValidObjectId } from '@/lib/utils/ids';

export const metadata: Metadata = { title: 'Student' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  SUSPENDED: 'danger',
} as const;

const CLASS_TONE = {
  PRESENT: 'success',
  LATE: 'warning',
  EXCUSED: 'neutral',
  ABSENT: 'danger',
} as const;

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const dossier = await getStudentDossier(id);
  const {
    user,
    profile,
    venture,
    support,
    submissions,
    ventureAttendance,
    classAttendance,
    totals,
  } = dossier;

  const timeline = toTimeline(dossier.progress);

  return (
    <>
      <PageHeader
        eyebrow="Students"
        title={user.name}
        description={profile ? `${profile.rollNumber} · Batch ${profile.batch}` : user.email}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[user.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
              {humanise(user.status) ?? user.status}
            </Badge>
            {profile?.cluster ? <Badge tone="neutral">Cluster {profile.cluster}</Badge> : null}
            {venture ? <Badge tone="info">{venture.ventureName}</Badge> : null}
          </span>
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/students" className="text-primary text-sm hover:underline">
              Back to students
            </Link>
            {venture ? (
              <ExportMenu
                dataset="student-progress"
                extraParams={{ studentVentureId: venture._id }}
              />
            ) : null}
          </span>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Where this student stands, at a glance                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Activities completed"
          value={`${totals.activitiesCompleted}/${totals.activitiesTotal}`}
          hint={`${totals.percentage}% of the programme`}
          icon={CheckCircle2}
          tone={totals.percentage === 100 ? 'positive' : 'primary'}
        />
        <KpiCard
          label="Submissions"
          value={totals.submissions}
          hint={`${totals.attemptsUsed} attempt(s) used · ${totals.reviewsReceived} verdict(s)`}
          icon={FileText}
        />
        <KpiCard
          label="Activity attendance"
          value={`${totals.ventureAttendancePresent} present`}
          hint={`${totals.ventureAttendanceAbsent} absent across ${totals.ventureAttendanceSessions} session(s)`}
          icon={CalendarCheck}
          tone={totals.ventureAttendanceAbsent > 0 ? 'warning' : 'positive'}
        />
        <KpiCard
          label="Support activities"
          value={`${totals.supportCompleted}/${totals.supportTotal}`}
          hint="Completed participation records"
          icon={HeartHandshake}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* The work                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Venture activities"
              description="Sequential — each one unlocks the next. Both reviewers must approve to complete."
              icon={Activity}
              action={
                venture ? (
                  <Link
                    href={`/admin/ventures/${venture._id}`}
                    className="text-primary text-[13px] font-medium hover:underline"
                  >
                    Open venture
                  </Link>
                ) : null
              }
            />
            {timeline.length === 0 ? (
              <EmptyState
                size="sm"
                title="No activity records"
                description="Records are created when the student is given a venture."
              />
            ) : (
              <>
                <CardBody>
                  <ProgressBar completed={totals.activitiesCompleted} total={timeline.length} />
                </CardBody>
                <ActivityTimeline rows={timeline} />
              </>
            )}
          </Card>

          {/* Every attempt, not just the current state: a resubmission creates
              a new record and none are overwritten, so this is the history. */}
          <Card>
            <CardHeader
              title="Submission history"
              description={`${submissions.length} attempt(s), newest first, with every verdict recorded against them.`}
              icon={ClipboardList}
            />
            {submissions.length === 0 ? (
              <EmptyState
                size="sm"
                title="Nothing submitted yet"
                description="Attempts appear here as soon as the student submits one."
              />
            ) : (
              <ul className="divide-border divide-y">
                {submissions.map((submission) => (
                  <li key={submission.submissionId} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-xs font-semibold">
                        {submission.activityCode}
                      </span>
                      <span className="text-[13.5px] font-medium">{submission.activityName}</span>
                      <Badge tone="neutral">
                        Attempt {submission.attemptNumber} ·{' '}
                        {humanise(submission.submissionType) ?? submission.submissionType}
                      </Badge>
                      <span className="type-caption ml-auto whitespace-nowrap">
                        {formatDateTime(submission.submittedAt)}
                      </span>
                    </div>

                    {submission.title ? (
                      <p className="mt-1.5 text-[13.5px] font-medium">{submission.title}</p>
                    ) : null}
                    {submission.content ? (
                      <p className="type-secondary mt-1 whitespace-pre-line">
                        {submission.content}
                      </p>
                    ) : null}

                    <p className="type-caption mt-1.5">
                      {submission.evidenceCount} evidence file(s) attached
                    </p>

                    {submission.reviews.length === 0 ? (
                      <p className="type-caption mt-2">Awaiting both verdicts.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {submission.reviews.map((review) => (
                          <li
                            key={review.reviewId}
                            className="surface-sunken rounded-lg px-3 py-2 text-[13px]"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <ReviewStatusBadge
                                status={review.status}
                                prefix={review.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                              />
                              <span className="text-muted-foreground">{review.reviewerName}</span>
                              <span className="type-caption ml-auto whitespace-nowrap">
                                {formatDateTime(review.reviewedAt)}
                              </span>
                            </div>
                            {review.comments ? (
                              <p className="mt-1.5 whitespace-pre-line">{review.comments}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Class attendance"
              description="Timetabled subject sessions. Separate from Venture Activity attendance."
              icon={GraduationCap}
            />
            {classAttendance.length === 0 ? (
              <EmptyState
                size="sm"
                title="No class attendance recorded"
                description="Attendance is optional and is marked per class under Academic → Classes."
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px]">
                  <caption className="sr-only">Class attendance for {user.name}</caption>
                  <thead>
                    <tr>
                      {['Date', 'Subject', 'Topic', 'Status'].map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className="bg-table-header text-table-header-foreground border-b px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classAttendance.map((row) => (
                      <tr key={row.sessionId} className="border-b last:border-b-0">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {formatDate(row.date)}
                          {row.startTime ? (
                            <span className="text-muted-foreground tabular-nums">
                              {' '}
                              {row.startTime}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.subjectCode ? (
                            <>
                              <span className="font-mono text-xs font-semibold">
                                {row.subjectCode}
                              </span>{' '}
                              <span className="text-muted-foreground">{row.subjectName}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-muted-foreground max-w-[18rem] truncate px-4 py-2.5">
                          {row.topic ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={CLASS_TONE[row.status] ?? 'neutral'}>
                            {humanise(row.status) ?? row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Who they are                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Account" icon={UserRound} />
            <CardBody className="space-y-3 text-sm">
              <Detail label="Email" icon={Mail}>
                <a href={`mailto:${user.email}`} className="text-primary hover:underline">
                  {user.email}
                </a>
              </Detail>
              <Detail label="Phone" icon={Phone}>
                {user.phone ?? '—'}
              </Detail>
              <Detail label="Roll number">{profile?.rollNumber ?? '—'}</Detail>
              <Detail label="Batch">{profile?.batch ?? '—'}</Detail>
              <Detail label="Cluster">{profile?.cluster ?? '—'}</Detail>
              <Detail label="Account created">{formatDate(user.createdAt)}</Detail>
            </CardBody>
          </Card>

          {profile &&
          (profile.background ||
            profile.strengths ||
            profile.weakness ||
            profile.personalContext) ? (
            <Card>
              <CardHeader
                title="Student profile"
                description="Context the student and programme office have recorded."
              />
              <CardBody className="space-y-3 text-sm">
                <Detail label="Background">{profile.background ?? '—'}</Detail>
                <Detail label="Strengths">{profile.strengths ?? '—'}</Detail>
                <Detail label="Areas to develop">{profile.weakness ?? '—'}</Detail>
                <Detail label="Personal context">{profile.personalContext ?? '—'}</Detail>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Venture" icon={Briefcase} />
            {venture ? (
              <CardBody className="space-y-3 text-sm">
                <div>
                  <Link
                    href={`/admin/ventures/${venture._id}`}
                    className="text-primary text-[15px] font-semibold hover:underline"
                  >
                    {venture.ventureName}
                  </Link>
                  {venture.ventureTitle ? (
                    <p className="type-secondary mt-0.5">{venture.ventureTitle}</p>
                  ) : null}
                  <p className="mt-1.5">
                    <Badge tone={venture.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {humanise(venture.status) ?? venture.status}
                    </Badge>
                  </p>
                </div>

                <Detail label="Industry">{venture.industry ?? '—'}</Detail>
                <Detail label="Target market">{venture.targetMarket ?? '—'}</Detail>
                <Detail label="Problem">{venture.problemStatement ?? '—'}</Detail>
                <Detail label="Solution">{venture.solution ?? '—'}</Detail>
                <Detail label="Funding status">{venture.fundingStatus ?? '—'}</Detail>
                <Detail label="Started">{formatDate(venture.createdAt)}</Detail>

                <div className="border-t pt-3">
                  <p className="type-overline mb-1.5">Reviewers</p>
                  {/* Both are required before anything can be reviewed, so a
                      missing one is worth showing rather than leaving blank. */}
                  <Detail label="Faculty">
                    {venture.facultyName ?? (
                      <span className="text-danger-soft-foreground">Not assigned</span>
                    )}
                  </Detail>
                  <Detail label="Mentor">
                    {venture.mentorName ?? (
                      <span className="text-danger-soft-foreground">Not assigned</span>
                    )}
                  </Detail>
                </div>
              </CardBody>
            ) : (
              <EmptyState
                size="sm"
                title="No venture yet"
                description="Create one under Ventures — it generates this student's activity records."
                action={
                  <Link
                    href="/admin/ventures"
                    className="text-primary text-[13px] font-medium hover:underline"
                  >
                    Go to ventures
                  </Link>
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Support activities"
              description={`${totals.supportCompleted} of ${totals.supportTotal} complete`}
              icon={HeartHandshake}
            />
            {support.length === 0 ? (
              <EmptyState
                size="sm"
                title="No support activity records"
                description="These are created alongside the venture."
              />
            ) : (
              <CardBody>
                <ul className="space-y-1.5">
                  {support.map(({ record, support: activity }) => (
                    <li
                      key={record._id.toString()}
                      className="surface-sunken flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                    >
                      <span className="min-w-0 text-sm">
                        <span className="font-mono text-xs">{activity.activityCode}</span>{' '}
                        {activity.name}
                      </span>
                      <Badge tone={record.status === 'COMPLETED' ? 'success' : 'neutral'}>
                        {humanise(record.status) ?? record.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            )}
          </Card>
        </div>
      </div>

      {/* Venture Activity attendance, per activity and per date. Its own
          section rather than a column on the timeline, because "where was this
          student on the 14th" is a different question from "how far have they
          got", and only one of the two has dates in it. */}
      {ventureAttendance.activities.length > 0 ? (
        <Section
          className="mt-5"
          title="Venture activity attendance"
          description={`${ventureAttendance.totals.present} present · ${ventureAttendance.totals.absent} absent across ${ventureAttendance.totals.sessions} recorded session(s). It gates nothing — an absence does not block a submission.`}
        >
          <Card>
            <ul className="divide-border divide-y">
              {ventureAttendance.activities.map((activity) => (
                <li key={activity.ventureActivityId} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      <span className="font-mono text-xs font-semibold">
                        {activity.activityCode}
                      </span>{' '}
                      {activity.name}
                    </span>
                    <span className="type-caption tabular-nums">
                      {activity.present} present · {activity.absent} absent
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {activity.attendanceRate}%
                    </span>
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {activity.marks.map((mark) => (
                      <li key={mark.date} title={mark.remarks || undefined}>
                        <span
                          className={
                            mark.status === 'PRESENT'
                              ? 'border-success-border bg-success-soft text-success-soft-foreground rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[12px] font-medium tabular-nums'
                              : 'border-danger-border bg-danger-soft text-danger-soft-foreground rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[12px] font-medium tabular-nums'
                          }
                        >
                          {formatDate(mark.date)}
                          {mark.remarks ? ' *' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </>
  );
}

function Detail({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Mail;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="type-overline flex items-center gap-1.5">
        {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
        {label}
      </p>
      <div className="mt-0.5 wrap-break-word whitespace-pre-wrap">{children}</div>
    </div>
  );
}
