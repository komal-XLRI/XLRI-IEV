import type { Metadata } from 'next';
import { CalendarCheck, CircleSlash, Percent, Presentation } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/ui/Card';
import { FilterBar, type FilterFieldDef } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { AttendanceTabs } from '@/components/admin/AttendanceTabs';
import {
  WorkshopAttendanceBoard,
  type OpenWorkshopRoster,
} from '@/components/admin/WorkshopAttendanceBoard';
import {
  getWorkshopAttendanceBoard,
  getWorkshopRoster,
} from '@/services/workshops/workshopAttendanceService';
import { parseReportFilters } from '@/validators/reportFilters';
import { isValidObjectId } from '@/lib/utils/ids';
import {
  WORKSHOP_MODES,
  WORKSHOP_MODE_LABELS,
  WORKSHOP_STATUSES,
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_TYPES,
  WORKSHOP_TYPE_LABELS,
} from '@/lib/constants/workshops';

export const metadata: Metadata = { title: 'Workshop attendance' };
export const dynamic = 'force-dynamic';

/**
 * Who turned up to each workshop.
 *
 * A workshop is a single occasion, so unlike the Venture Activity register
 * there is no date to choose — `markWorkshop` alone identifies the register,
 * and the roster is read on the server for exactly that workshop.
 */
export default async function WorkshopAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);

  const raw = params.markWorkshop;
  const markWorkshop = Array.isArray(raw) ? raw[0] : raw;

  const board = await getWorkshopAttendanceBoard(filters);

  const roster: OpenWorkshopRoster | null =
    markWorkshop && isValidObjectId(markWorkshop)
      ? await getWorkshopRoster(markWorkshop, { batch: filters.batch }).then((loaded) => ({
          workshop: loaded.workshop,
          rows: loaded.rows,
        }))
      : null;

  const fields: FilterFieldDef[] = [
    { name: 'q', label: 'Search', type: 'search', placeholder: 'Workshop title' },
    {
      name: 'workshopType',
      label: 'Type',
      type: 'select',
      options: WORKSHOP_TYPES.map((type) => ({ value: type, label: WORKSHOP_TYPE_LABELS[type] })),
    },
    {
      name: 'workshopMode',
      label: 'Mode',
      type: 'select',
      options: WORKSHOP_MODES.map((mode) => ({ value: mode, label: WORKSHOP_MODE_LABELS[mode] })),
    },
    {
      name: 'workshopStatus',
      label: 'Status',
      type: 'select',
      options: WORKSHOP_STATUSES.map((status) => ({
        value: status,
        label: WORKSHOP_STATUS_LABELS[status],
      })),
    },
    { name: 'dateFrom', label: 'From', type: 'date' },
    { name: 'dateTo', label: 'To', type: 'date' },
  ];

  const { totals } = board;

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Attendance"
        description="Who turned up to each workshop. The register covers every active student — the same people the announcement email goes to — and gates nothing."
      />

      <AttendanceTabs active="workshops" />

      <FilterBar fields={fields}>
        <ExportMenu dataset="workshop-attendance" label="Export attendance" />
      </FilterBar>

      <div className="mt-4 mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Workshops"
          value={totals.workshops}
          hint={`${totals.expected} student(s) invited to each`}
          icon={Presentation}
          tone="primary"
        />
        <KpiCard
          label="Marks recorded"
          value={totals.records}
          hint={`Across ${totals.workshops} workshop(s)`}
          icon={CalendarCheck}
          tone="accent"
        />
        <KpiCard
          label="Present / absent"
          value={`${totals.present} / ${totals.absent}`}
          hint={totals.absent === 0 ? 'No absences recorded' : `${totals.absent} absence(s)`}
          icon={totals.absent === 0 ? CalendarCheck : CircleSlash}
          tone={totals.absent === 0 ? 'positive' : 'neutral'}
        />
        {/* Measured against the marks that exist, never against the cohort: a
            register nobody has taken is not 0% attendance. */}
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

      {/* Explains a register that covers fewer people than expected, rather
          than leaving the number to be discovered. */}
      {totals.excluded > 0 ? (
        <p className="border-warning-border bg-warning-soft text-warning-soft-foreground rounded-control mb-4 border px-3 py-2 text-[13px]">
          {totals.excluded} student account
          {totals.excluded === 1 ? ' is' : 's are'} not active, so{' '}
          {totals.excluded === 1 ? 'it' : 'they'} appear on no workshop register and receive no
          announcement email. Activate them under Students if they should be included.
        </p>
      ) : null}

      <WorkshopAttendanceBoard rows={board.rows} roster={roster} />
    </>
  );
}
