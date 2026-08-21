'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { cn } from '@/lib/utils/cn';

export interface GridCell {
  ventureActivityId: string;
  assigned: boolean;
  records: number;
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
}

export interface GridColumn {
  _id: string;
  activityCode: string;
  name: string;
  order: number;
  sessions: number;
  records: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

export interface GridRow {
  studentVentureId: string;
  studentName: string;
  rollNumber: string;
  batch: string;
  ventureName: string;
  cells: GridCell[];
  records: number;
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
}

const SORTS = {
  roll: 'Roll number',
  name: 'Student name',
  lowest: 'Lowest attendance',
  absences: 'Most absences',
  unmarked: 'Most gaps in the register',
} as const;

type SortKey = keyof typeof SORTS;

/**
 * The consolidated grid: students down, activities across.
 *
 * Read as a heat map rather than a table of numbers — at eleven students and
 * twelve activities nobody scans 132 cells, they look for the dark ones. The
 * cell therefore leads with the percentage and keeps the counts underneath it.
 *
 * A cell has three distinct states and they must not look alike: attended,
 * on the activity but never marked, and not on the activity at all. Only the
 * first is a number; the other two are absences of one, and colouring them
 * as 0% would invent a problem nobody has.
 */
export function ConsolidatedAttendanceGrid({
  columns,
  rows,
}: {
  columns: GridColumn[];
  rows: GridRow[];
}) {
  const [sort, setSort] = useState<SortKey>('roll');

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing to consolidate yet"
          description="No student is assigned to an activity in this filter. Clear the filters, or assign ventures under Venture Activities."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Consolidated attendance"
        description="One row per student, one column per activity. A percentage is measured against the marks that exist — a blank cell means no register, not zero attendance."
        action={
          <>
            <label className="sr-only" htmlFor="consolidated-sort">
              Sort students
            </label>
            <select
              id="consolidated-sort"
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

      <TableShell>
        <thead>
          <tr>
            {/* Sticky so the student stays attached to their row across twelve
                columns of numbers. */}
            <Th className="bg-table-header sticky left-0 z-10">Student</Th>
            {columns.map((column) => (
              <Th key={column._id} align="center" className="min-w-24">
                <span className="block font-mono">{column.activityCode}</span>
                <span className="type-caption block normal-case">
                  {column.sessions} date{column.sessions === 1 ? '' : 's'}
                </span>
              </Th>
            ))}
            <Th align="right">Overall</Th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            // The row carries an opaque background on both stripes so the
            // sticky name cell can inherit it: a transparent sticky cell lets
            // the numbers slide visibly underneath it.
            <Tr key={row.studentVentureId} className="bg-surface even:bg-table-row-alt">
              <Td className="sticky left-0 z-10 bg-inherit">
                <Link
                  href={`/admin/attendance/student/${row.studentVentureId}`}
                  className="hover:text-primary block text-[13.5px] font-medium hover:underline"
                >
                  {row.studentName}
                </Link>
                <span className="type-caption block">
                  {row.rollNumber ? <span className="font-mono">{row.rollNumber}</span> : null}
                  {row.rollNumber ? ' · ' : null}
                  {row.ventureName}
                </span>
              </Td>

              {row.cells.map((cell) => (
                <Td key={cell.ventureActivityId} align="center" className="px-2">
                  <CellValue cell={cell} />
                </Td>
              ))}

              <Td align="right">
                <RateBadge rate={row.attendanceRate} strong />
                <span className="type-caption block tabular-nums">
                  {row.present}/{row.records} marked
                  {row.unmarked > 0 ? ` · ${row.unmarked} gap${row.unmarked === 1 ? '' : 's'}` : ''}
                </span>
              </Td>
            </Tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="surface-sunken">
            <Td className="surface-sunken sticky left-0 z-10 font-semibold">All students</Td>
            {columns.map((column) => (
              <Td key={column._id} align="center" className="px-2">
                <RateBadge rate={column.attendanceRate} />
                <span className="type-caption block tabular-nums">
                  {column.present}/{column.records}
                </span>
              </Td>
            ))}
            <Td align="right">
              <RateBadge
                rate={rateOf(
                  rows.reduce((sum, row) => sum + row.present, 0),
                  rows.reduce((sum, row) => sum + row.records, 0),
                )}
                strong
              />
            </Td>
          </tr>
        </tfoot>
      </TableShell>
    </Card>
  );
}

/** Attended, assigned-but-unmarked, or not on the activity — three states, three looks. */
function CellValue({ cell }: { cell: GridCell }) {
  if (!cell.assigned) {
    return (
      <span className="text-muted-foreground/50" title="Not assigned to this activity">
        —
      </span>
    );
  }

  if (cell.records === 0) {
    return (
      <span className="type-caption" title="Assigned, but never marked on this activity">
        Not marked
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <RateBadge rate={cell.attendanceRate} />
      <span className="type-caption tabular-nums">
        {cell.present}/{cell.records}
        {cell.unmarked > 0 ? ` · ${cell.unmarked} gap` : ''}
      </span>
    </span>
  );
}

function RateBadge({ rate, strong = false }: { rate: number | null; strong?: boolean }) {
  if (rate === null) {
    return <span className="type-caption">—</span>;
  }

  return (
    <span
      className={cn(
        'rounded-control inline-block px-1.5 py-0.5 tabular-nums',
        strong ? 'text-[13.5px] font-semibold' : 'text-[12.5px] font-medium',
        rate >= 90
          ? 'bg-success-soft text-success-soft-foreground'
          : rate >= 75
            ? 'bg-info-soft text-info-soft-foreground'
            : rate >= 50
              ? 'bg-warning-soft text-warning-soft-foreground'
              : 'bg-danger-soft text-danger-soft-foreground',
      )}
    >
      {rate}%
    </span>
  );
}

function rateOf(present: number, records: number): number | null {
  return records === 0 ? null : Math.round((present / records) * 100);
}

function sortRows(rows: GridRow[], sort: SortKey): GridRow[] {
  const byRoll = (a: GridRow, b: GridRow) =>
    a.rollNumber.localeCompare(b.rollNumber) || a.studentName.localeCompare(b.studentName);

  switch (sort) {
    case 'name':
      return [...rows].sort((a, b) => a.studentName.localeCompare(b.studentName));
    case 'lowest':
      // Students with no marks at all have no rate, so they sort last rather
      // than being read as 0% and heading a "worst attendance" list.
      return [...rows].sort((a, b) => {
        if (a.attendanceRate === null && b.attendanceRate === null) return byRoll(a, b);
        if (a.attendanceRate === null) return 1;
        if (b.attendanceRate === null) return -1;
        return a.attendanceRate - b.attendanceRate || byRoll(a, b);
      });
    case 'absences':
      return [...rows].sort((a, b) => b.absent - a.absent || byRoll(a, b));
    case 'unmarked':
      return [...rows].sort((a, b) => b.unmarked - a.unmarked || byRoll(a, b));
    default:
      return [...rows].sort(byRoll);
  }
}
