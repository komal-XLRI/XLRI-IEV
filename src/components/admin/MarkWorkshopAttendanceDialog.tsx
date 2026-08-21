'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  ClipboardPaste,
  Clock,
  Eraser,
  MapPin,
  MessageSquare,
  Search,
  Users,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import {
  matchAttendeesAction,
  saveWorkshopAttendanceAction,
} from '@/app/actions/adminWorkshopAttendance';
import { ATTENDANCE_MARKS, type AttendanceMark } from '@/lib/constants/status';
import {
  WORKSHOP_MODE_LABELS,
  WORKSHOP_TYPE_LABELS,
  type WorkshopMode,
  type WorkshopStatus,
  type WorkshopType,
} from '@/lib/constants/workshops';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';

export interface WorkshopRosterRowView {
  studentId: string;
  studentName: string;
  email: string;
  rollNumber: string;
  batch: string;
  status: AttendanceMark | null;
  remarks: string;
  markedAt: string | null;
  markedByName: string | null;
}

export interface WorkshopHeaderView {
  _id: string;
  title: string;
  workshopType: WorkshopType;
  date: string;
  startTime: string;
  endTime: string;
  mode: WorkshopMode;
  venue: string | null;
  status: WorkshopStatus;
  speakerName: string;
  /** False for a draft or a cancelled workshop — there was nothing to attend. */
  markable: boolean;
}

/**
 * Taking the register for one workshop.
 *
 * No date control, unlike the Venture Activity register: a workshop happens on
 * its own date, so there is only ever one register and re-opening this dialog
 * edits it rather than starting another.
 *
 * Present and Absent are the only two marks. Unmarked is not a third state to
 * choose — it is the absence of a row — so Clear removes a mark rather than a
 * button competing with the two real ones.
 */
export function MarkWorkshopAttendanceDialog({
  open,
  onClose,
  workshop,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  workshop: WorkshopHeaderView;
  rows: WorkshopRosterRowView[];
}) {
  const [draft, setDraft] = useState<Record<string, AttendanceMark | null>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [openRemark, setOpenRemark] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteReport, setPasteReport] = useState<{
    matched: number;
    unmatched: string[];
    duplicates: string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [matching, startMatching] = useTransition();
  const { notify } = useToast();

  const statusOf = (row: WorkshopRosterRowView) =>
    row.studentId in draft ? draft[row.studentId] : row.status;
  const remarkOf = (row: WorkshopRosterRowView) =>
    row.studentId in remarks ? remarks[row.studentId]! : row.remarks;

  const counts = useMemo(() => {
    const running = { PRESENT: 0, ABSENT: 0, UNMARKED: 0 };
    for (const row of rows) {
      const status = row.studentId in draft ? draft[row.studentId] : row.status;
      if (status) running[status] += 1;
      else running.UNMARKED += 1;
    }
    return running;
  }, [rows, draft]);

  const changed = rows.filter(
    (row) => statusOf(row) !== row.status || remarkOf(row) !== row.remarks,
  );
  const savable = rows.filter((row) => statusOf(row) !== null);
  const cleared = rows.filter((row) => row.status !== null && statusOf(row) === null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      `${row.studentName} ${row.rollNumber} ${row.email}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  function choose(row: WorkshopRosterRowView, status: AttendanceMark) {
    setDraft((current) => ({
      ...current,
      [row.studentId]: statusOf(row) === status ? null : status,
    }));
  }

  /** Applies to what is on screen, not the whole roll — the search narrows it. */
  function markAll(status: AttendanceMark) {
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((row) => [row.studentId, status])),
    }));
  }

  function clearAll() {
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((row) => [row.studentId, null])),
    }));
  }

  /**
   * Marks everybody on a pasted attendee list Present.
   *
   * Only the matches are touched. Everyone else is left exactly as they were
   * rather than being marked Absent: a Zoom export lists joiners, and treating
   * its silence as an absence would mark the whole in-person half of a hybrid
   * workshop away. Mark all Absent first if that is what you want.
   */
  function applyPaste() {
    startMatching(async () => {
      const formData = new FormData();
      formData.set('text', paste);

      const result = await matchAttendeesAction(null, formData);

      if (!result.ok) {
        notify({ tone: 'error', title: 'Could not read that list', description: result.message });
        return;
      }

      const { matched, unmatched, duplicates } = result.data;

      setDraft((current) => ({
        ...current,
        ...Object.fromEntries(matched.map((entry) => [entry.studentId, 'PRESENT' as const])),
      }));

      setPasteReport({ matched: matched.length, unmatched, duplicates });
    });
  }

  function save() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('workshopId', workshop._id);

      for (const row of savable) {
        formData.set(`status:${row.studentId}`, statusOf(row)!);
        const remark = remarkOf(row).trim();
        if (remark) formData.set(`remarks:${row.studentId}`, remark);
      }

      for (const row of cleared) {
        formData.set(`clear:${row.studentId}`, '1');
      }

      const result = await saveWorkshopAttendanceAction(null, formData);

      if (!result.ok) {
        notify({ tone: 'error', title: 'Could not save attendance', description: result.message });
        return;
      }

      const removed =
        result.data.cleared > 0 ? `, ${result.data.cleared} returned to unmarked` : '';

      notify({
        tone: 'success',
        title: 'Attendance saved',
        description: `${result.data.marked} student(s) marked${removed} for ${workshop.title}.`,
      });
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Workshop attendance"
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground font-medium">{workshop.title}</span>
          <Badge tone="muted">{WORKSHOP_TYPE_LABELS[workshop.workshopType]}</Badge>
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
              pending ||
              !workshop.markable ||
              changed.length === 0 ||
              (savable.length === 0 && cleared.length === 0)
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
      {/* The occasion, stated rather than chosen: a workshop is its own date,
          so there is nothing here to pick. */}
      <div className="surface-sunken rounded-control mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2.5">
        <span className="type-caption inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{formatDate(workshop.date)}</span>
        </span>
        <span className="type-caption inline-flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">
            {workshop.startTime} &ndash; {workshop.endTime}
          </span>
        </span>
        <span className="type-caption inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {WORKSHOP_MODE_LABELS[workshop.mode]}
          {workshop.venue ? ` · ${workshop.venue}` : ''}
        </span>
        <span className="type-caption inline-flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {rows.length} student{rows.length === 1 ? '' : 's'} invited
        </span>
      </div>

      {!workshop.markable ? (
        <p className="border-warning-border bg-warning-soft text-warning-soft-foreground rounded-control mb-3 border px-3 py-2 text-[13px]">
          This workshop is not published, so there was nothing to attend. Publish it first, or mark
          it completed.
        </p>
      ) : null}

      {/* Pasting the attendee list, for the online sessions where the register
          is produced somewhere else. */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setPasteOpen((current) => !current)}
          aria-expanded={pasteOpen}
          className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
        >
          <ClipboardPaste className="size-3.5" aria-hidden="true" />
          Paste an attendee list
        </button>

        {pasteOpen ? (
          <div className="border-border rounded-control mt-2 border p-3">
            <label className="type-caption mb-1.5 block" htmlFor="attendee-paste">
              Email addresses from Zoom, Meet or a sign-in sheet. Commas, spaces, new lines and
              “Name &lt;address&gt;” all work.
            </label>
            <textarea
              id="attendee-paste"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              rows={4}
              placeholder={'asha@programme.edu\nbhavin@programme.edu'}
              className={cn(COMPACT_CONTROL_CLASSES, 'w-full font-mono text-[12.5px]')}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={applyPaste}
                disabled={matching || paste.trim() === ''}
              >
                {matching ? 'Matching…' : 'Mark these present'}
              </Button>
              <span className="type-caption">
                Nothing is saved until you press Save — everyone not on the list is left as they
                are.
              </span>
            </div>

            {pasteReport ? (
              <div className="mt-2 space-y-1">
                <p className="text-success-soft-foreground text-[13px] font-medium">
                  {pasteReport.matched} student{pasteReport.matched === 1 ? '' : 's'} marked
                  present.
                </p>
                {/* Reported, never dropped: a silently ignored line is a
                    student silently missing from the register. */}
                {pasteReport.unmatched.length > 0 ? (
                  <p className="type-caption">
                    <span className="text-warning-soft-foreground font-medium">
                      {pasteReport.unmatched.length} address
                      {pasteReport.unmatched.length === 1 ? '' : 'es'} matched no active student:
                    </span>{' '}
                    <span className="font-mono">{pasteReport.unmatched.join(', ')}</span>
                  </p>
                ) : null}
                {pasteReport.duplicates.length > 0 ? (
                  <p className="type-caption">
                    Listed more than once:{' '}
                    <span className="font-mono">{pasteReport.duplicates.join(', ')}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
            placeholder="Search name, roll number or email"
            aria-label="Search this register"
            className={cn(COMPACT_CONTROL_CLASSES, 'w-full pl-8')}
          />
        </div>
      </div>

      <div>
        {visible.length === 0 ? (
          <p className="type-secondary py-8 text-center">
            {rows.length === 0
              ? 'There are no active students to mark.'
              : `Nobody here matches “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => {
              const status = statusOf(row);
              const remark = remarkOf(row);
              const showRemark = openRemark[row.studentId] || remark.length > 0;

              return (
                <li
                  key={row.studentId}
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
                        {row.email}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenRemark((current) => ({
                          ...current,
                          [row.studentId]: !current[row.studentId],
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
                        onClick={() =>
                          setDraft((current) => ({ ...current, [row.studentId]: null }))
                        }
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
                      placeholder="Optional remark (e.g. joined late, informed in advance)"
                      aria-label={`Remark for ${row.studentName}`}
                      onChange={(event) =>
                        setRemarks((current) => ({
                          ...current,
                          [row.studentId]: event.target.value,
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
 * selected fires no change event, and clearing a mark is exactly that click.
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
