import type { Metadata } from 'next';
import { CalendarCheck, CalendarDays, CircleSlash, Percent } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard } from '@/components/ui/Card';
import { MeterBar } from '@/components/ui/Chart';
import {
  AttendanceCalendar,
  type AttendanceCalendarMark,
} from '@/components/student/AttendanceCalendar';
import { getVentureByStudentId } from '@/services/ventures/studentVentureService';
import { getStudentAttendance } from '@/services/ventures/attendanceService';

export const metadata: Metadata = { title: 'My attendance' };
export const dynamic = 'force-dynamic';

/**
 * A student's own Venture Activity attendance.
 *
 * Read-only by construction: there is no form, no action and no mutation
 * imported anywhere on this page. Attendance is a record the programme office
 * keeps about the student, not one the student keeps about themselves.
 *
 * The month grid is the page's subject, because the question a student opens
 * this page with is "which days am I marked absent" — a question a list
 * grouped by activity makes them reconstruct. The per-activity rates stay
 * below it, where they answer the other question rather than getting in the
 * way of the first.
 */
export default async function StudentAttendancePage() {
  const user = await requireRole('STUDENT');
  const venture = await getVentureByStudentId(user.userId);

  if (!venture) {
    return (
      <>
        <PageHeader title="My attendance" />
        <Card>
          <EmptyState
            title="No venture assigned yet"
            description="Attendance is recorded against your venture activities, which start once your programme office creates your venture."
          />
        </Card>
      </>
    );
  }

  const { activities, totals } = await getStudentAttendance(venture._id.toString());

  // The calendar reads days, not activities, so the marks are flattened out of
  // their activity grouping — each one keeps the code it belongs to, which is
  // what a cell shows and what the day detail lists.
  const marks: AttendanceCalendarMark[] = activities.flatMap((activity) =>
    activity.marks.map((mark) => ({
      date: mark.date,
      status: mark.status,
      activityCode: activity.activityCode,
      activityName: activity.name,
      remarks: mark.remarks,
    })),
  );

  return (
    <>
      <PageHeader
        title="My attendance"
        description="Day by day, as your programme office has recorded it against your venture activities. This is a record only — it does not affect your progress, your attempts or your reviews."
      />

      {activities.length === 0 ? (
        <Card>
          <EmptyState
            title="No attendance recorded yet"
            description="Nothing has been marked against your venture activities so far. Sessions appear here as soon as the programme office records one."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Sessions"
              value={totals.sessions}
              hint={`Across ${activities.length} activity(s)`}
              icon={CalendarDays}
              tone="primary"
            />
            <KpiCard label="Present" value={totals.present} icon={CalendarCheck} tone="positive" />
            <KpiCard
              label="Absent"
              value={totals.absent}
              hint={totals.absent === 0 ? 'A full record' : 'Recorded absences'}
              icon={CircleSlash}
              tone={totals.absent === 0 ? 'positive' : 'warning'}
            />
            <KpiCard
              label="Attendance"
              value={totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`}
              hint={`${totals.present} of ${totals.sessions} session(s)`}
              icon={Percent}
              tone={(totals.attendanceRate ?? 100) >= 75 ? 'positive' : 'warning'}
            />
          </div>

          <AttendanceCalendar marks={marks} />

          <Card className="mt-5">
            <CardHeader
              title="By activity"
              description="The same record, totalled per venture activity."
            />

            <CardBody className="space-y-2.5">
              {activities.map((activity) => (
                <div
                  key={activity.ventureActivityId}
                  className="surface-sunken rounded-control flex flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">
                      <span className="bg-muted text-foreground mr-1.5 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                        {activity.activityCode}
                      </span>
                      {activity.name}
                    </span>
                    <span className="type-caption">
                      {activity.sessions} session(s) · {activity.present} present ·{' '}
                      {activity.absent} absent
                    </span>
                  </span>

                  <span className="flex items-center gap-2">
                    <span className="w-24 sm:w-32">
                      <MeterBar
                        value={activity.present}
                        max={Math.max(1, activity.sessions)}
                        size="sm"
                        showValue={false}
                        tone={activity.absent === 0 ? 'success' : 'warning'}
                        label={`${activity.activityCode} attendance`}
                      />
                    </span>
                    <span className="w-10 text-right text-[15px] font-semibold tabular-nums">
                      {activity.attendanceRate}%
                    </span>
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
