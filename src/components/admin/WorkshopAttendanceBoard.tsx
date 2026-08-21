'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, Clock, MapPin, SquarePen, Users } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { MeterBar } from '@/components/ui/Chart';
import {
  MarkWorkshopAttendanceDialog,
  type WorkshopHeaderView,
  type WorkshopRosterRowView,
} from './MarkWorkshopAttendanceDialog';
import {
  WORKSHOP_MODE_LABELS,
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_TYPE_LABELS,
} from '@/lib/constants/workshops';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';

export interface WorkshopAttendanceRowView extends WorkshopHeaderView {
  expected: number;
  present: number;
  absent: number;
  records: number;
  unmarked: number;
  attendanceRate: number | null;
}

/** The roster the server loaded for whichever workshop is being marked. */
export interface OpenWorkshopRoster {
  workshop: WorkshopHeaderView;
  rows: WorkshopRosterRowView[];
}

const STATUS_TONE = {
  DRAFT: 'muted',
  PUBLISHED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
} as const;

const SORTS = {
  recent: 'Most recent first',
  upcoming: 'Oldest first',
  lowest: 'Lowest attendance',
  unrecorded: 'No register yet',
} as const;

type SortKey = keyof typeof SORTS;

/**
 * The workshop register.
 *
 * One row per workshop, because a workshop is a single occasion — there is no
 * date to choose inside it, and Edit opens the only register it will ever
 * have. Which workshop is open lives in the URL, so its roster is read on the
 * server for exactly that workshop.
 *
 * Drafts and cancelled workshops stay in the list rather than being hidden.
 * Somebody scanning for "which registers still need taking" has to be able to
 * see that one cannot be taken; omitting it silently reads as done.
 */
export function WorkshopAttendanceBoard({
  rows,
  roster,
}: {
  rows: WorkshopAttendanceRowView[];
  roster: OpenWorkshopRoster | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sort, setSort] = useState<SortKey>('recent');
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  function navigate(workshopId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (workshopId) params.set('markWorkshop', workshopId);
    else params.delete('markWorkshop');

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No workshops match these filters"
          description="Clear the filters, or create a workshop under Academic → Workshops."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Workshops"
        description="One row per workshop. A workshop happens on its own date, so it has one register — Edit opens it, and opening it again corrects it."
        action={
          <>
            <label className="sr-only" htmlFor="workshop-attendance-sort">
              Sort workshops
            </label>
            <select
              id="workshop-attendance-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className={COMPACT_CONTROL_CLASSES}
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </>
        }
      />

      <ul className="divide-border divide-y">
        {sorted.map((row) => (
          <li key={row._id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="type-caption shrink-0 tabular-nums">{formatDate(row.date)}</span>
                  <span className="text-[14px] font-semibold">{row.title}</span>
                  <Badge tone="muted">{WORKSHOP_TYPE_LABELS[row.workshopType]}</Badge>
                  <Badge tone={STATUS_TONE[row.status]}>{WORKSHOP_STATUS_LABELS[row.status]}</Badge>
                </div>

                <p className="type-caption mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="size-3 shrink-0" aria-hidden="true" />
                    {row.startTime}&ndash;{row.endTime}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    {WORKSHOP_MODE_LABELS[row.mode]}
                    {row.venue ? ` · ${row.venue}` : ''}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3 shrink-0" aria-hidden="true" />
                    {row.expected} invited
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
                    {row.records} marked
                  </span>
                </p>

                <RowStats row={row} />
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!row.markable || row.expected === 0}
                  onClick={() => navigate(row._id)}
                  title={
                    row.markable
                      ? undefined
                      : 'A draft was never announced and a cancelled workshop did not happen'
                  }
                  aria-label={`Mark attendance for ${row.title}`}
                >
                  <SquarePen className="size-3.5" aria-hidden="true" />
                  {row.records > 0 ? 'Edit' : 'Take register'}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {roster ? (
        <MarkWorkshopAttendanceDialog
          // Keyed by workshop: opening a different one must not carry the
          // previous register's unsaved marks with it.
          key={roster.workshop._id}
          open
          onClose={() => navigate(null)}
          workshop={roster.workshop}
          rows={roster.rows}
        />
      ) : null}
    </Card>
  );
}

function RowStats({ row }: { row: WorkshopAttendanceRowView }) {
  if (!row.markable) {
    return (
      <p className="type-caption mt-2">
        {row.status === 'CANCELLED'
          ? 'Cancelled — there was nothing to attend.'
          : 'Still a draft, so nobody has been told about it yet.'}
      </p>
    );
  }

  if (row.records === 0) {
    return <p className="type-caption mt-2">No register taken yet.</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums">
        <span className="text-success-soft-foreground font-medium">{row.present} present</span>
        <span
          className={cn(
            row.absent > 0 ? 'text-danger-soft-foreground font-medium' : 'text-muted-foreground',
          )}
        >
          {row.absent} absent
        </span>
        {/* A gap in the register, not an absence — nobody said these students
            were away, only that nobody said anything. */}
        {row.unmarked > 0 ? (
          <span className="text-muted-foreground">{row.unmarked} not marked</span>
        ) : null}
      </span>

      <span className="flex min-w-32 flex-1 items-center gap-2 sm:max-w-56">
        <MeterBar
          value={row.present}
          max={Math.max(1, row.records)}
          size="sm"
          showValue={false}
          tone={
            row.absent === 0 ? 'success' : (row.attendanceRate ?? 0) >= 75 ? 'primary' : 'warning'
          }
          label={`${row.title} attendance`}
        />
        <span className="text-[13px] font-semibold tabular-nums">{row.attendanceRate}%</span>
      </span>
    </div>
  );
}

function sortRows(rows: WorkshopAttendanceRowView[], sort: SortKey): WorkshopAttendanceRowView[] {
  const byDate = (a: WorkshopAttendanceRowView, b: WorkshopAttendanceRowView) =>
    new Date(b.date).getTime() - new Date(a.date).getTime();

  switch (sort) {
    case 'upcoming':
      return [...rows].sort((a, b) => -byDate(a, b));
    case 'lowest':
      // A workshop with no register has no rate at all, so it sorts last
      // rather than being read as 0% and heading a "worst attendance" list.
      return [...rows].sort((a, b) => {
        if (a.attendanceRate === null && b.attendanceRate === null) return byDate(a, b);
        if (a.attendanceRate === null) return 1;
        if (b.attendanceRate === null) return -1;
        return a.attendanceRate - b.attendanceRate || byDate(a, b);
      });
    case 'unrecorded':
      return [...rows].sort((a, b) => a.records - b.records || byDate(a, b));
    default:
      return [...rows].sort(byDate);
  }
}
