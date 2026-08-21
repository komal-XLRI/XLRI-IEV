'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, CheckCircle2, History, SquarePen, Users } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { MeterBar } from '@/components/ui/Chart';
import { MarkAttendanceDialog, type RosterRowView } from './MarkAttendanceDialog';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';

export interface AttendanceRowView {
  _id: string;
  activityCode: string;
  name: string;
  order: number;
  termName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  windowState: 'BEFORE' | 'OPEN' | 'AFTER' | null;
  students: number;
  sessions: number;
  records: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

export interface AttendanceHistoryView {
  date: string;
  present: number;
  absent: number;
  marked: number;
}

/** The roster the server loaded for whichever activity is being marked. */
export interface OpenRoster {
  activityId: string;
  date: string;
  rows: RosterRowView[];
  history: AttendanceHistoryView[];
}

const WINDOW_BADGE = {
  OPEN: { tone: 'success', label: 'Window open' },
  BEFORE: { tone: 'info', label: 'Opens later' },
  AFTER: { tone: 'muted', label: 'Window closed' },
} as const;

const SORTS = {
  order: 'Programme order',
  lowest: 'Lowest attendance',
  absences: 'Most absences',
  sessions: 'Most sessions',
  unrecorded: 'No register yet',
} as const;

type SortKey = keyof typeof SORTS;

/**
 * The attendance register.
 *
 * One row per Venture Activity, the way a course register is one row per
 * session, and Edit on each row opens the dialog that takes it. Marking lives
 * behind that dialog rather than inline: it is a task with a beginning and an
 * end, and nothing should be written by a stray click while someone reads
 * the list.
 *
 * Which activity and date the dialog is on lives in the URL, not in component
 * state, so the roster is loaded on the server for exactly that pair — a
 * register never has to guess who is on it.
 */
export function AttendanceBoard({
  rows,
  activityCount,
  roster,
  scopeNote,
}: {
  rows: AttendanceRowView[];
  /** Activities defined in total, so a filtered row still reads "#3/12". */
  activityCount: number;
  /** Present only while a register is open. */
  roster: OpenRoster | null;
  /** What the page's filters have narrowed the register to, if anything. */
  scopeNote: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sort, setSort] = useState<SortKey>('order');
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const openRow = rows.find((row) => row._id === roster?.activityId) ?? null;

  /** Opening, closing and re-dating the register are all URL changes. */
  function navigate(next: { markActivity?: string | null; markDate?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No venture activities match these filters"
          description="Clear the filters, or define the programme's activities under Venture Activities."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Venture activities"
        description="One row per activity. Edit opens the register for a date; an activity can have as many dates as it needs."
        action={
          <>
            <label className="sr-only" htmlFor="attendance-sort">
              Sort the register
            </label>
            <select
              id="attendance-sort"
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
        {sorted.map((row) => {
          const historyOpen = showHistory === row._id;

          return (
            <li key={row._id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="type-caption shrink-0 font-mono tabular-nums">
                      #{row.order}/{activityCount}
                    </span>
                    <Link
                      href={`/admin/venture-activities/${row._id}`}
                      className="hover:text-primary text-[14px] font-semibold hover:underline"
                    >
                      <span className="font-mono">{row.activityCode}</span> {row.name}
                    </Link>

                    {row.windowState ? (
                      <Badge tone={WINDOW_BADGE[row.windowState].tone}>
                        {WINDOW_BADGE[row.windowState].label}
                      </Badge>
                    ) : null}

                    {/* A full register: every assigned student marked on every
                        date it has been taken. */}
                    {row.sessions > 0 && row.records === row.students * row.sessions ? (
                      <Badge tone="success" icon={CheckCircle2}>
                        Complete
                      </Badge>
                    ) : null}
                  </div>

                  <p className="type-caption mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {row.termName ? <span>{row.termName}</span> : null}
                    {row.startDate && row.endDate ? (
                      <span className="tabular-nums">
                        {formatDate(row.startDate)} &ndash; {formatDate(row.endDate)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3 shrink-0" aria-hidden="true" />
                      {row.students} student{row.students === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
                      {row.sessions} date{row.sessions === 1 ? '' : 's'} recorded
                    </span>
                  </p>

                  <RowStats row={row} />
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {row.sessions > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowHistory(historyOpen ? null : row._id)}
                      aria-expanded={historyOpen}
                    >
                      <History className="size-3.5" aria-hidden="true" />
                      History
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={row.students === 0}
                    onClick={() => navigate({ markActivity: row._id })}
                    aria-label={`Mark attendance for ${row.activityCode} ${row.name}`}
                  >
                    <SquarePen className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                </div>
              </div>

              {historyOpen ? (
                <HistoryList
                  activityId={row._id}
                  students={row.students}
                  history={roster?.activityId === row._id ? roster.history : null}
                  onOpen={(date) => navigate({ markActivity: row._id, markDate: date })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {openRow && roster ? (
        <MarkAttendanceDialog
          // Keyed by activity and date: moving either loads a different register,
          // and its unsaved marks must not travel with it.
          key={`${roster.activityId}:${roster.date}`}
          open
          onClose={() => navigate({ markActivity: null, markDate: null })}
          activity={openRow}
          activityCount={activityCount}
          date={roster.date}
          rows={roster.rows}
          scopeNote={scopeNote}
          onChangeDate={(date) => navigate({ markDate: date })}
        />
      ) : null}
    </Card>
  );
}

/**
 * The dates this activity already has a register for.
 *
 * Only loaded for the activity whose register is open — the board would
 * otherwise carry every date for every activity into the page to show a list
 * nobody has asked for yet.
 */
function HistoryList({
  activityId,
  students,
  history,
  onOpen,
}: {
  activityId: string;
  students: number;
  history: AttendanceHistoryView[] | null;
  onOpen: (date: string) => void;
}) {
  if (history === null) {
    return (
      <p className="type-caption border-border mt-3 ml-1 border-l py-1 pl-3">
        <button
          type="button"
          onClick={() => onOpen('')}
          className="text-primary font-medium hover:underline"
        >
          Open the register
        </button>{' '}
        to see the dates recorded for this activity.
      </p>
    );
  }

  return (
    <ul className="border-border mt-3 ml-1 space-y-1 border-l pl-3" aria-label="Attendance history">
      {history.map((entry) => (
        <li
          key={`${activityId}:${entry.date}`}
          className="flex flex-wrap items-center gap-x-3 py-0.5"
        >
          <button
            type="button"
            onClick={() => onOpen(entry.date.slice(0, 10))}
            className="text-primary text-[13px] font-medium tabular-nums hover:underline"
          >
            {formatDate(entry.date)}
          </button>
          <span className="type-caption tabular-nums">
            {entry.present} present · {entry.absent} absent
            {entry.marked < students ? ` · ${students - entry.marked} unmarked` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "10 present · 0 absent · 100% attendance", with the bar. */
function RowStats({ row }: { row: AttendanceRowView }) {
  if (row.students === 0) {
    return <p className="type-caption mt-2">No student is assigned to this activity yet.</p>;
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
      </span>

      {/* Measured against the marks that exist, never against the cohort: a
          register nobody has taken is not 0% attendance. */}
      <span className="flex min-w-32 flex-1 items-center gap-2 sm:max-w-56">
        <MeterBar
          value={row.present}
          max={Math.max(1, row.records)}
          size="sm"
          showValue={false}
          tone={
            row.absent === 0 ? 'success' : (row.attendanceRate ?? 0) >= 75 ? 'primary' : 'warning'
          }
          label={`${row.activityCode} attendance`}
        />
        <span className="text-[13px] font-semibold tabular-nums">{row.attendanceRate}%</span>
      </span>
    </div>
  );
}

function sortRows(rows: AttendanceRowView[], sort: SortKey): AttendanceRowView[] {
  const byOrder = (a: AttendanceRowView, b: AttendanceRowView) => a.order - b.order;

  switch (sort) {
    case 'lowest':
      // Activities with no register have no rate at all, so they sort last
      // rather than being read as 0% and dominating a "worst attendance" list.
      return [...rows].sort((a, b) => {
        if (a.attendanceRate === null && b.attendanceRate === null) return byOrder(a, b);
        if (a.attendanceRate === null) return 1;
        if (b.attendanceRate === null) return -1;
        return a.attendanceRate - b.attendanceRate || byOrder(a, b);
      });
    case 'absences':
      return [...rows].sort((a, b) => b.absent - a.absent || byOrder(a, b));
    case 'sessions':
      return [...rows].sort((a, b) => b.sessions - a.sessions || byOrder(a, b));
    case 'unrecorded':
      return [...rows].sort((a, b) => a.sessions - b.sessions || byOrder(a, b));
    default:
      return [...rows].sort(byOrder);
  }
}
