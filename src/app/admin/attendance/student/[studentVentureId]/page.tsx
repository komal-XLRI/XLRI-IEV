import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Percent,
  SquarePen,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, EmptyState, KpiCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { FilterBar, type FilterFieldDef } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { AttendanceTabs } from '@/components/admin/AttendanceTabs';
import { StudentAttendanceSwitcher } from '@/components/admin/StudentAttendanceSwitcher';
import {
  getIndividualAttendance,
  listAttendanceActivities,
} from '@/services/ventures/attendanceService';
import { listAttendanceVentureOptions } from '@/services/ventures/ventureOptions';
import { parseReportFilters } from '@/validators/reportFilters';
import { isValidObjectId } from '@/lib/utils/ids';
import { formatDate, formatDateTime, toDateInputValue } from '@/lib/utils/dates';
import { ATTENDANCE_MARKS, ATTENDANCE_MARK_LABELS } from '@/lib/constants/status';

export const metadata: Metadata = { title: 'Individual attendance' };
export const dynamic = 'force-dynamic';

/**
 * One student's attendance record, in full.
 *
 * Lists every activity the student is assigned to, including the ones nobody
 * has marked them on. A report that showed only the activities with marks
 * would be unable to answer the question it is usually opened for — "why is
 * their attendance 60%?" — when the answer is that three registers were never
 * taken.
 */
export default async function IndividualAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentVentureId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { studentVentureId } = await params;
  if (!isValidObjectId(studentVentureId)) notFound();

  const filters = parseReportFilters(await searchParams);

  const [report, activities, ventures] = await Promise.all([
    getIndividualAttendance(studentVentureId, filters),
    listAttendanceActivities(),
    listAttendanceVentureOptions(),
  ]);

  const { student, totals } = report;

  const fields: FilterFieldDef[] = [
    {
      name: 'ventureActivityId',
      label: 'Activity',
      type: 'select',
      options: activities.map((activity) => ({
        value: activity._id,
        label: `${activity.activityCode} · ${activity.name}`,
      })),
    },
    {
      name: 'attendanceStatus',
      label: 'Status',
      type: 'select',
      options: ATTENDANCE_MARKS.map((status) => ({
        value: status,
        label: ATTENDANCE_MARK_LABELS[status],
      })),
    },
    { name: 'dateFrom', label: 'From', type: 'date' },
    { name: 'dateTo', label: 'To', type: 'date' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title={student.studentName}
        description={[
          student.rollNumber,
          student.batch ? `Batch ${student.batch}` : null,
          student.ventureName,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <Link
            href={`/admin/students/${student.studentId}`}
            className="text-primary inline-flex items-center gap-1.5 text-[13.5px] font-medium hover:underline"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Full student record
          </Link>
        }
      />

      <AttendanceTabs active="individual" />

      <FilterBar fields={fields}>
        <StudentAttendanceSwitcher current={studentVentureId} options={ventures} />
        {/* The student is in the path, not the query, so it is passed to the
            export explicitly — otherwise the download would be the whole cohort. */}
        <ExportMenu
          dataset="venture-attendance"
          label="Export"
          extraParams={{ studentVentureId }}
        />
      </FilterBar>

      <div className="mt-4 mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Marked"
          value={totals.records}
          hint={`Across ${totals.activities} assigned activity(s)`}
          icon={CalendarDays}
          tone="primary"
        />
        <KpiCard
          label="Present / absent"
          value={`${totals.present} / ${totals.absent}`}
          hint={totals.absent === 0 ? 'No absences recorded' : `${totals.absent} absence(s)`}
          icon={totals.absent === 0 ? CheckCircle2 : CircleSlash}
          tone={totals.absent === 0 ? 'positive' : 'neutral'}
        />
        {/* Nobody said this student was away — only that nobody said anything. */}
        <KpiCard
          label="Not marked"
          value={totals.unmarked}
          hint={
            totals.unmarked === 0
              ? 'Present on every register taken'
              : 'Register dates with no mark for this student'
          }
          icon={CircleSlash}
          tone={totals.unmarked === 0 ? 'positive' : 'warning'}
        />
        <KpiCard
          label="Attendance"
          value={totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`}
          hint={
            totals.attendanceRate === null
              ? 'Not marked on any register yet'
              : `${totals.present} present of ${totals.records} marked`
          }
          icon={Percent}
          tone={
            totals.attendanceRate === null
              ? 'neutral'
              : totals.attendanceRate >= 75
                ? 'positive'
                : 'warning'
          }
        />
      </div>

      {report.activities.length === 0 ? (
        <Card>
          <EmptyState
            title="This venture has no activities assigned"
            description="Activity records are created with the venture. Check the venture under Ventures."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {report.activities.map((activity) => (
            <Card key={activity._id}>
              <CardHeader
                title={`${activity.activityCode} · ${activity.name}`}
                description={[
                  `Activity #${activity.order}`,
                  activity.termName,
                  activity.startDate && activity.endDate
                    ? `${formatDate(activity.startDate)} – ${formatDate(activity.endDate)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <Link
                    href={`/admin/attendance?markActivity=${activity._id}`}
                    className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
                  >
                    <SquarePen className="size-3.5" aria-hidden="true" />
                    Open register
                  </Link>
                }
              />

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-1 pb-3">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums">
                  <span className="text-success-soft-foreground font-medium">
                    {activity.present} present
                  </span>
                  <span
                    className={
                      activity.absent > 0
                        ? 'text-danger-soft-foreground font-medium'
                        : 'text-muted-foreground'
                    }
                  >
                    {activity.absent} absent
                  </span>
                  <span className="text-muted-foreground">
                    {activity.sessions} register date{activity.sessions === 1 ? '' : 's'}
                  </span>
                  {activity.unmarked > 0 ? (
                    <span className="text-warning-soft-foreground font-medium">
                      {activity.unmarked} not marked
                    </span>
                  ) : null}
                </span>

                {activity.attendanceRate !== null ? (
                  <span className="flex min-w-32 flex-1 items-center gap-2 sm:max-w-56">
                    <MeterBar
                      value={activity.present}
                      max={Math.max(1, activity.present + activity.absent)}
                      size="sm"
                      showValue={false}
                      tone={
                        activity.absent === 0
                          ? 'success'
                          : activity.attendanceRate >= 75
                            ? 'primary'
                            : 'warning'
                      }
                      label={`${activity.activityCode} attendance`}
                    />
                    <span className="text-[13px] font-semibold tabular-nums">
                      {activity.attendanceRate}%
                    </span>
                  </span>
                ) : null}
              </div>

              {activity.marks.length === 0 ? (
                <p className="type-caption border-border border-t px-5 py-3">
                  {activity.sessions === 0
                    ? 'No register has been taken for this activity yet.'
                    : `The register was taken on ${activity.sessions} date(s), but this student was never marked on any of them.`}
                </p>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Status</Th>
                      <Th>Remark</Th>
                      <Th>Marked by</Th>
                      <Th>Marked at</Th>
                      <Th align="right">Register</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.marks.map((mark) => (
                      <Tr key={mark.date}>
                        <Td className="font-medium whitespace-nowrap tabular-nums">
                          {formatDate(mark.date)}
                        </Td>
                        <Td>
                          <Badge
                            tone={mark.status === 'PRESENT' ? 'success' : 'danger'}
                            icon={mark.status === 'PRESENT' ? CheckCircle2 : CircleSlash}
                          >
                            {ATTENDANCE_MARK_LABELS[mark.status]}
                          </Badge>
                        </Td>
                        <Td className="type-secondary max-w-72">{mark.remarks || '—'}</Td>
                        <Td className="whitespace-nowrap">{mark.markedByName ?? '—'}</Td>
                        <Td className="type-caption whitespace-nowrap tabular-nums">
                          {mark.markedAt ? formatDateTime(mark.markedAt) : '—'}
                        </Td>
                        <Td align="right">
                          <Link
                            href={`/admin/attendance?markActivity=${activity._id}&markDate=${toDateInputValue(mark.date)}`}
                            className="text-primary text-[13px] font-medium hover:underline"
                          >
                            Edit
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
