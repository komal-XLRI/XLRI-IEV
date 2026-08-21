'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  CircleSlash,
  Eraser,
  Hourglass,
  Layers,
  MessageSquare,
  Search,
  Users,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { saveAttendanceAction } from '@/app/actions/adminAttendance';
import { ATTENDANCE_MARKS, type AttendanceMark } from '@/lib/constants/status';
import { formatDate, formatDateTime, toDateInputValue } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';

export interface RosterRowView {
  studentVentureId: string;
  ventureName: string;
  studentName: string;
  rollNumber: string;
  status: AttendanceMark | null;
  remarks: string;
  markedAt: string | null;
  markedByName: string | null;
}

export interface RosterActivityView {
  _id: string;
  activityCode: string;
  name: string;
  order: number;
  termName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
}

/**
 * Taking the register for one Venture Activity, on one date.
 *
 * A dialog rather than an inline expansion, because marking is a task with a
 * beginning and an end: it opens on one activity and date, it has its own
 * Cancel, and nothing is written until Save. Closing discards, which is what
 * makes "mark everyone present, then fix three people" safe to start.
 *
 * Present and Absent are the only two marks. Unmarked is not a third state to
 * choose — it is the absence of a row — so Clear is a separate control rather
 * than a third option competing with the two real ones, and clicking the
 * current answer again does the same thing.
 *
 * Clearing a mark that is already saved deletes its row when the register is
 * saved. That has to be explicit: an omitted student reads as "unchanged" on
 * the server, so silence cannot also mean "delete".
 */
export function MarkAttendanceDialog({
  open,
  onClose,
  activity,
  activityCount,
  date,
  rows,
  scopeNote,
  onChangeDate,
}: {
  open: boolean;
  onClose: () => void;
  activity: RosterActivityView;
  activityCount: number;
  /** ISO date the register is being taken for. */
  date: string;
  rows: RosterRowView[];
  scopeNote: string | null;
  /** Navigates the page to another date; the roster is re-read on the server. */
  onChangeDate: (date: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, AttendanceMark | null>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [openRemark, setOpenRemark] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const statusOf = (row: RosterRowView) =>
    row.studentVentureId in draft ? draft[row.studentVentureId] : row.status;
  const remarkOf = (row: RosterRowView) =>
    row.studentVentureId in remarks ? remarks[row.studentVentureId]! : row.remarks;

  const counts = useMemo(() => {
    const running = { PRESENT: 0, ABSENT: 0, UNMARKED: 0 };
    for (const row of rows) {
      const status = row.studentVentureId in draft ? draft[row.studentVentureId] : row.status;
      if (status) running[status] += 1;
      else running.UNMARKED += 1;
    }
    return running;
  }, [rows, draft]);

  const changed = rows.filter(
    (row) => statusOf(row) !== row.status || remarkOf(row) !== row.remarks,
  );

  // Only marks are saved. A remark on a student nobody has marked has nothing
  // to attach to, so it is not a change worth submitting on its own.
  const savable = rows.filter((row) => statusOf(row) !== null);

  // Someone whose mark has been clicked off. Omitting them would read as
  // "unchanged" on the server, so the clear has to be sent explicitly or it
  // would look like it saved and change nothing.
  const cleared = rows.filter((row) => row.status !== null && statusOf(row) === null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      `${row.studentName} ${row.rollNumber} ${row.ventureName}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  function choose(row: RosterRowView, status: AttendanceMark) {
    setDraft((current) => ({
      ...current,
      [row.studentVentureId]: statusOf(row) === status ? null : status,
    }));
  }

  /** Applies to what is on screen, not to the whole roll — the search narrows it. */
  function markAll(status: AttendanceMark) {
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((row) => [row.studentVentureId, status])),
    }));
  }

  /** Takes every visible mark back off the register, saved ones included. */
  function clearAll() {
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((row) => [row.studentVentureId, null])),
    }));
  }

  function clear(row: RosterRowView) {
    setDraft((current) => ({ ...current, [row.studentVentureId]: null }));
  }

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('ventureActivityId', activity._id);
      formData.set('date', toDateInputValue(date));

      for (const row of savable) {
        formData.set(`status:${row.studentVentureId}`, statusOf(row)!);
        const remark = remarkOf(row).trim();
        if (remark) formData.set(`remarks:${row.studentVentureId}`, remark);
      }

      for (const row of cleared) {
        formData.set(`clear:${row.studentVentureId}`, '1');
      }

      const result = await saveAttendanceAction(null, formData);

      if (!result.ok) {
        notify({ tone: 'error', title: 'Could not save attendance', description: result.message });
        return;
      }

      const removed =
        result.data.cleared > 0 ? `, ${result.data.cleared} returned to unmarked` : '';

      notify({
        tone: 'success',
        title: 'Attendance saved',
        description: `${result.data.marked} student(s) marked${removed} for ${activity.activityCode} on ${formatDate(result.data.date)}.`,
      });
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Mark attendance"
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground font-medium">{activity.name}</span>
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
            {activity.activityCode}
          </span>
        </span>
      }
      footer={
        <>
          <span className="type-caption mr-auto">
            {changed.length === 0
              ? 'No changes yet.'
              : `${changed.length} change${changed.length === 1 ? '' : 's'} to save.`}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              pending || changed.length === 0 || (savable.length === 0 && cleared.length === 0)
            }
          >
            {pending
              ? 'Saving…'
              : savable.length === 0
                ? `Clear ${cleared.length} mark${cleared.length === 1 ? '' : 's'}`
                : `Save attendance (${savable.length} student${savable.length === 1 ? '' : 's'})`}
          </Button>
        </>
      }
    >
      <div className="surface-sunken rounded-control mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2.5">
        {/* The date is the register's identity, so it is a control rather than
            a caption — changing it loads that day's marks. */}
        <label className="flex items-center gap-2">
          <span className="type-overline">Attendance date</span>
          <input
            type="date"
            value={toDateInputValue(date)}
            onChange={(event) => {
              if (event.target.value) onChangeDate(event.target.value);
            }}
            className={COMPACT_CONTROL_CLASSES}
          />
        </label>

        {activity.startDate && activity.endDate ? (
          <span className="type-caption inline-flex items-center gap-1.5">
            <CalendarRange className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">
              {formatDate(activity.startDate)} &ndash; {formatDate(activity.endDate)}
            </span>
          </span>
        ) : null}

        <span className="type-caption inline-flex items-center gap-1.5">
          <Hourglass className="size-3.5 shrink-0" aria-hidden="true" />
          {activity.durationDays} day{activity.durationDays === 1 ? '' : 's'}
        </span>

        <span className="type-caption inline-flex items-center gap-1.5">
          <Layers className="size-3.5 shrink-0" aria-hidden="true" />
          Activity #{activity.order} / {activityCount}
          {activity.termName ? ` · ${activity.termName}` : ''}
        </span>

        <span className="type-caption inline-flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {rows.length} student{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {scopeNote ? (
        <p className="type-caption mb-3">
          {scopeNote} Students outside this filter are hidden and will not be changed.
        </p>
      ) : null}

      {/* The toolbar sticks to the top of the scrolling body, so Mark all, the
          running count and the search stay reachable however far down the roll
          you are. The negative side inset lets its background span the body's
          padding, otherwise rows slide out from under it at the edges. */}
      <div className="bg-surface border-border sticky top-0 z-10 -mx-5 mb-2 border-b px-5 pt-0.5 pb-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="type-caption">Mark all:</span>
          {ATTENDANCE_MARKS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => markAll(status)}
              className={cn(
                'rounded-control border px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:brightness-95',
                status === 'PRESENT'
                  ? 'border-success-border bg-success-soft text-success-soft-foreground'
                  : 'border-danger-border bg-danger-soft text-danger-soft-foreground',
              )}
            >
              {status === 'PRESENT' ? 'Present' : 'Absent'}
            </button>
          ))}

          {/* Not a third mark — it removes whatever mark is there, which is the
              only way back to unmarked once somebody has been marked. */}
          <button
            type="button"
            onClick={clearAll}
            disabled={visible.every((row) => statusOf(row) === null)}
            title="Take every visible mark back off the register"
            className="rounded-control border-input-border text-muted-foreground hover:bg-surface-hover hover:text-foreground inline-flex items-center gap-1.5 border px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            <Eraser className="size-3.5" aria-hidden="true" />
            Clear all
          </button>

          <span className="ml-auto text-[13px] tabular-nums">
            <span className="text-success-soft-foreground font-medium">
              {counts.PRESENT} present
            </span>
            <span className="text-muted-foreground"> · </span>
            <span
              className={
                counts.ABSENT > 0
                  ? 'text-danger-soft-foreground font-medium'
                  : 'text-muted-foreground'
              }
            >
              {counts.ABSENT} absent
            </span>
            {counts.UNMARKED > 0 ? (
              <span className="text-muted-foreground"> · {counts.UNMARKED} unmarked</span>
            ) : null}
          </span>
        </div>

        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student, roll number or venture"
            aria-label="Search this register"
            className={cn(COMPACT_CONTROL_CLASSES, 'w-full pl-8')}
          />
        </div>
      </div>

      {/* The dialog body is the only scroller: the panel is capped, so the roll
          runs its natural length inside it rather than nesting a second one. */}
      <div>
        {visible.length === 0 ? (
          <p className="type-secondary py-8 text-center">
            {rows.length === 0
              ? 'No student is assigned to this venture activity yet.'
              : `Nobody here matches “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => {
              const status = statusOf(row);
              const remark = remarkOf(row);
              const showRemark = openRemark[row.studentVentureId] || remark.length > 0;

              return (
                <li
                  key={row.studentVentureId}
                  className={cn(
                    'rounded-control border px-3 py-2 transition-colors',
                    status === 'PRESENT'
                      ? 'border-success-border bg-success-soft/50'
                      : status === 'ABSENT'
                        ? 'border-danger-border bg-danger-soft/50'
                        : 'border-border bg-surface',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-muted text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                    >
                      {row.studentName.trim().charAt(0).toUpperCase() || '?'}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {row.studentName}
                      </span>
                      <span className="type-caption block truncate">
                        {row.rollNumber ? (
                          <span className="font-mono">{row.rollNumber}</span>
                        ) : null}
                        {row.rollNumber ? ' · ' : null}
                        {row.ventureName}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenRemark((current) => ({
                          ...current,
                          [row.studentVentureId]: !current[row.studentVentureId],
                        }))
                      }
                      aria-label={`Add a remark for ${row.studentName}`}
                      title="Remark"
                      className={cn(
                        'rounded-control inline-flex size-7 shrink-0 items-center justify-center border transition-colors',
                        remark
                          ? 'border-info-border bg-info-soft text-info-soft-foreground'
                          : 'border-input-border text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                      )}
                    >
                      <MessageSquare className="size-3.5" aria-hidden="true" />
                    </button>

                    <fieldset className="flex shrink-0 items-center gap-1">
                      <legend className="sr-only">Attendance for {row.studentName}</legend>
                      <Choice
                        checked={status === 'PRESENT'}
                        tone="present"
                        label="Present"
                        onSelect={() => choose(row, 'PRESENT')}
                      />
                      <Choice
                        checked={status === 'ABSENT'}
                        tone="absent"
                        label="Absent"
                        onSelect={() => choose(row, 'ABSENT')}
                      />
                      <button
                        type="button"
                        onClick={() => clear(row)}
                        disabled={status === null}
                        aria-label={`Clear the mark for ${row.studentName}`}
                        title="Return to unmarked"
                        className="rounded-control border-input-border text-muted-foreground hover:bg-surface-hover hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center border transition-colors disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Eraser className="size-3.5" aria-hidden="true" />
                      </button>
                    </fieldset>
                  </div>

                  {showRemark ? (
                    <input
                      type="text"
                      value={remark}
                      maxLength={300}
                      placeholder="Optional remark (e.g. arrived late, informed in advance)"
                      aria-label={`Remark for ${row.studentName}`}
                      onChange={(event) =>
                        setRemarks((current) => ({
                          ...current,
                          [row.studentVentureId]: event.target.value,
                        }))
                      }
                      className={cn(COMPACT_CONTROL_CLASSES, 'mt-2 w-full')}
                    />
                  ) : null}

                  {row.markedAt ? (
                    <p className="type-caption mt-1.5">
                      Marked by {row.markedByName ?? 'an administrator'} on{' '}
                      {formatDateTime(row.markedAt)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/**
 * A radio that can also be unset.
 *
 * `onClick` rather than `onChange`: clicking the option that is already
 * selected fires no change event, and clearing a mark back to unmarked is
 * exactly that click.
 */
function Choice({
  checked,
  tone,
  label,
  onSelect,
}: {
  checked: boolean;
  tone: 'present' | 'absent';
  label: string;
  onSelect: () => void;
}) {
  const Icon = tone === 'present' ? CheckCircle2 : CircleSlash;

  return (
    <label
      title={checked ? 'Click again to clear this mark' : `Mark ${label.toLowerCase()}`}
      className={cn(
        'rounded-control inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
        checked
          ? tone === 'present'
            ? 'border-success-border bg-success text-success-foreground'
            : 'border-danger-border bg-danger text-danger-foreground'
          : 'border-input-border text-muted-foreground hover:bg-surface-hover hover:text-foreground',
      )}
    >
      <input
        type="radio"
        checked={checked}
        onClick={onSelect}
        onChange={() => {}}
        className="sr-only"
      />
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </label>
  );
}
