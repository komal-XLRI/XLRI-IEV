import type { Metadata } from 'next';
import { CalendarCheck, CalendarDays, CircleSlash, Percent } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard } from '@/components/ui/Card';
import { MeterBar } from '@/components/ui/Chart';
import { getVentureByStudentId } from '@/services/ventures/studentVentureService';
import { getStudentAttendance } from '@/services/ventures/attendanceService';
import { formatDate } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'My attendance' };
export const dynamic = 'force-dynamic';

/**
 * A student's own Venture Activity attendance.
 *
 * Read-only by construction: there is no form, no action and no mutation
 * imported anywhere on this page. Attendance is a record the programme office
 * keeps about the student, not one the student keeps about themselves.
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

  return (
    <>
      <PageHeader
        title="My attendance"
        description="Sessions your programme office has recorded against your venture activities. This is a record only — it does not affect your progress, your attempts or your reviews."
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

          <div className="space-y-4">
            {activities.map((activity) => (
              <Card key={activity.ventureActivityId}>
                <CardHeader
                  title={`${activity.activityCode} · ${activity.name}`}
                  description={`${activity.sessions} session(s) · ${activity.present} present · ${activity.absent} absent`}
                  action={
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
                      <span className="text-[15px] font-semibold tabular-nums">
                        {activity.attendanceRate}%
                      </span>
                    </span>
                  }
                />

                <CardBody>
                  <ul className="space-y-1.5">
                    {activity.marks.map((mark) => (
                      <li
                        key={mark.date}
                        className={
                          mark.status === 'PRESENT'
                            ? 'border-success-border bg-success-soft/50 rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2'
                            : 'border-danger-border bg-danger-soft/50 rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2'
                        }
                      >
                        <span className="text-[13.5px] font-medium tabular-nums">
                          {formatDate(mark.date)}
                        </span>
                        <span
                          className={
                            mark.status === 'PRESENT'
                              ? 'text-success-soft-foreground text-[13px] font-semibold'
                              : 'text-danger-soft-foreground text-[13px] font-semibold'
                          }
                        >
                          {mark.status === 'PRESENT' ? 'Present' : 'Absent'}
                        </span>
                        {/* The remark is the programme office's note on this
                            mark, and the student is entitled to read it. */}
                        {mark.remarks ? (
                          <span className="type-caption min-w-0 flex-1">{mark.remarks}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
