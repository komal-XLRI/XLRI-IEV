import type { Metadata } from 'next';
import { CalendarDays, CircleSlash, Percent, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/ui/Card';
import { FilterBar, type FilterFieldDef } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { AttendanceTabs } from '@/components/admin/AttendanceTabs';
import { ConsolidatedAttendanceGrid } from '@/components/admin/ConsolidatedAttendanceGrid';
import {
  getConsolidatedAttendance,
  listAttendanceActivities,
} from '@/services/ventures/attendanceService';
import { listAttendanceVentureOptions } from '@/services/ventures/ventureOptions';
import { parseReportFilters } from '@/validators/reportFilters';

export const metadata: Metadata = { title: 'Consolidated attendance' };
export const dynamic = 'force-dynamic';

/**
 * Attendance across the whole cohort, in one grid.
 *
 * The status filter is deliberately absent. Every other view here can be
 * narrowed to Present or Absent and still mean something; a grid of present
 * *and* absent counts cannot, because filtering to one of them would print
 * zero in the other column and read as a finding.
 */
export default async function ConsolidatedAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseReportFilters(await searchParams);

  const [consolidated, activities, ventures] = await Promise.all([
    getConsolidatedAttendance(filters),
    listAttendanceActivities(),
    listAttendanceVentureOptions(),
  ]);

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
    { name: 'dateFrom', label: 'From', type: 'date' },
    { name: 'dateTo', label: 'To', type: 'date' },
  ];

  const { totals } = consolidated;

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Attendance"
        description="Every student against every Venture Activity. A percentage is measured against the marks that exist, so an untaken register reads as blank rather than as nobody turning up."
      />

      <AttendanceTabs active="consolidated" />

      <FilterBar fields={fields}>
        <ExportMenu dataset="venture-attendance-consolidated" label="Export consolidated" />
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
          label="Register dates"
          value={totals.sessions}
          hint={`${totals.records} attendance record(s)`}
          icon={CalendarDays}
          tone="accent"
        />
        {/* A gap in the register, not an absence: nobody said this student was
            away, only that nobody said anything. */}
        <KpiCard
          label="Not marked"
          value={totals.unmarked}
          hint={
            totals.unmarked === 0
              ? 'Every register is complete'
              : 'Student/date pairs with no mark recorded'
          }
          icon={CircleSlash}
          tone={totals.unmarked === 0 ? 'positive' : 'warning'}
        />
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

      <ConsolidatedAttendanceGrid columns={consolidated.columns} rows={consolidated.rows} />
    </>
  );
}
