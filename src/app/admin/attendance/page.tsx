import type { Metadata } from 'next';
import { CalendarCheck, CalendarDays, CircleSlash, Percent, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/ui/Card';
import { FilterBar, type FilterFieldDef } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { AttendanceBoard, type OpenRoster } from '@/components/admin/AttendanceBoard';
import { AttendanceTabs } from '@/components/admin/AttendanceTabs';
import {
  getAttendanceBoard,
  getAttendanceRoster,
  listAttendanceActivities,
} from '@/services/ventures/attendanceService';
import { listAttendanceVentureOptions } from '@/services/ventures/ventureOptions';
import { parseReportFilters } from '@/validators/reportFilters';
import { isValidObjectId } from '@/lib/utils/ids';
import { ATTENDANCE_MARKS, ATTENDANCE_MARK_LABELS } from '@/lib/constants/status';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

/**
 * The Venture Activity attendance register.
 *
 * Filter state lives in the URL rather than in component state, which is what
 * lets the export reproduce the screen exactly, makes a filtered register
 * shareable as a link, and survives a refresh — without the page and the
 * exporter keeping separate copies of the filters.
 *
 * `markActivity` and `markDate` are in the URL for the same reason: the roster
 * for an open register is read on the server for exactly that pair, so the
 * dialog never has to guess who is on it or what they were already marked.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);

  const single = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const markActivity = single('markActivity');
  const markDate = single('markDate');

  const [board, activities, ventures] = await Promise.all([
    getAttendanceBoard(filters),
    listAttendanceActivities(),
    listAttendanceVentureOptions(),
  ]);

  // A register defaults to today, which is what someone taking one now wants.
  const rosterDate = markDate ? new Date(markDate) : new Date();

  const roster: OpenRoster | null =
    markActivity && isValidObjectId(markActivity) && !Number.isNaN(rosterDate.getTime())
      ? await getAttendanceRoster(markActivity, rosterDate).then((loaded) => ({
          activityId: markActivity,
          date: loaded.date,
          rows: loaded.rows,
          history: loaded.history,
        }))
      : null;

  const fields: FilterFieldDef[] = [
    { name: 'q', label: 'Search', type: 'search', placeholder: 'Student or venture name' },
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
      name: 'studentVentureId',
      label: 'Venture',
      type: 'select',
      options: ventures.map((venture) => ({
        value: venture._id,
        label: `${venture.ventureName} — ${venture.studentName}`,
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

  const { totals } = board;

  // Said in the marking dialog, so nobody takes a register believing it covers
  // the whole cohort when a filter has quietly removed half of it.
  const scope = [
    filters.q ? `a search for “${filters.q}”` : null,
    filters.studentVentureId
      ? (ventures.find((venture) => venture._id === filters.studentVentureId)?.ventureName ??
        'one venture')
      : null,
    filters.batch ? `batch ${filters.batch}` : null,
  ].filter(Boolean);

  const scopeNote = scope.length > 0 ? `The register is filtered to ${scope.join(' and ')}.` : null;

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Attendance"
        description="Who turned up to each Venture Activity, on each date it ran. This register gates nothing — an absence does not lock an activity, consume an attempt or affect a review."
      />

      <AttendanceTabs active="register" />

      <FilterBar fields={fields}>
        <ExportMenu dataset="venture-attendance" label="Export attendance" />
      </FilterBar>

      <div className="mt-4 mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Students"
          value={totals.students}
          hint={`Across ${totals.activities} activity(s)`}
          icon={Users}
          tone="primary"
        />
        <KpiCard
          label="Dates recorded"
          value={totals.sessions}
          hint={`${totals.records} attendance record(s)`}
          icon={CalendarDays}
          tone="accent"
        />
        <KpiCard
          label="Present / absent"
          value={`${totals.present} / ${totals.absent}`}
          hint={totals.absent === 0 ? 'No absences recorded' : `${totals.absent} absence(s)`}
          icon={totals.absent === 0 ? CalendarCheck : CircleSlash}
          tone={totals.absent === 0 ? 'positive' : 'neutral'}
        />
        {/* Measured against the marks that exist, never against the cohort — an
            empty register is not 0% attendance, and reporting it as one invents
            a problem that nobody has. */}
        <KpiCard
          label="Attendance"
          value={totals.attendanceRate === null ? '—' : `${totals.attendanceRate}%`}
          hint={
            totals.attendanceRate === null
              ? 'No register taken yet'
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

      <AttendanceBoard
        rows={board.rows}
        activityCount={board.activityCount}
        roster={roster}
        scopeNote={scopeNote}
      />
    </>
  );
}
