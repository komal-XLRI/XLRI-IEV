'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, CircleDashed, CircleSlash, Search, Users } from 'lucide-react';
import { Card, CardFooter, CardHeader, EmptyState } from '@/components/ui/Card';
import { Button, SubmitButton } from '@/components/ui/Button';
import { ActionForm } from '@/components/forms/ActionForm';
import { useToast } from '@/components/ui/Toast';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import {
  markAllVentureAttendanceAction,
  markVentureAttendanceAction,
} from '@/app/actions/adminVentures';
import {
  VENTURE_ATTENDANCE_LABELS,
  VENTURE_ATTENDANCE_STATUSES,
  type VentureAttendanceStatus,
} from '@/lib/constants/status';
import { cn } from '@/lib/utils/cn';

export interface AttendanceRow {
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  attendanceStatus: VentureAttendanceStatus;
}

const ICON = {
  PENDING: CircleDashed,
  PRESENT: CheckCircle2,
  ABSENT: CircleSlash,
} as const;

/**
 * The attendance roster for one Venture Activity.
 *
 * Three radios per student rather than a dropdown: attendance is taken by
 * running down a list, and a select costs two interactions per row where a
 * radio costs one. The whole roster saves in a single submit, so a marker who
 * gets halfway and closes the tab has changed nothing rather than half of it.
 *
 * Everything is inside a real `<form>` posting to a Server Action — the search
 * and the counters are the only client state, so the page still works if the
 * JavaScript never arrives.
 */
export function AttendanceRoster({
  ventureActivityId,
  activityLabel,
  rows,
  counts,
}: {
  ventureActivityId: string;
  activityLabel: string;
  rows: AttendanceRow[];
  counts: Record<VentureAttendanceStatus, number>;
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Record<string, VentureAttendanceStatus>>({});
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      `${row.studentName} ${row.studentEmail} ${row.ventureName}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const statusOf = (row: AttendanceRow) => draft[row.recordId] ?? row.attendanceStatus;
  const changed = rows.filter((row) => statusOf(row) !== row.attendanceStatus).length;

  /** Applies one status to everyone currently on screen, not to the whole cohort. */
  function setAllVisible(status: VentureAttendanceStatus) {
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((row) => [row.recordId, status])),
    }));
  }

  function markEveryone(status: VentureAttendanceStatus) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('ventureActivityId', ventureActivityId);
      formData.set('attendanceStatus', status);

      const result = await markAllVentureAttendanceAction(null, formData);

      notify(
        result.ok
          ? {
              tone: 'success',
              title: `Everyone marked ${VENTURE_ATTENDANCE_LABELS[status].toLowerCase()}`,
              description: `${result.data.updated} record(s) updated.`,
            }
          : { tone: 'error', title: 'Could not save attendance', description: result.message },
      );

      if (result.ok) setDraft({});
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Attendance" icon={Users} />
        <EmptyState
          size="sm"
          title="No students on this activity yet"
          description="Activity records appear once a venture is created for a student."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Attendance"
        description={`${counts.PRESENT} present · ${counts.ABSENT} absent · ${counts.PENDING} not yet marked`}
        icon={Users}
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => markEveryone('PRESENT')}
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Mark all present
          </Button>
        }
      />

      <ActionForm
        action={markVentureAttendanceAction}
        onSuccess={(data) => {
          setDraft({});
          notify({
            tone: 'success',
            title: 'Attendance saved',
            description: `${data.updated} record(s) updated for ${activityLabel}.`,
          });
        }}
      >
        {() => (
          <>
            <input type="hidden" name="ventureActivityId" value={ventureActivityId} />

            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search student or venture"
                  aria-label="Search the attendance roster"
                  className={cn(COMPACT_CONTROL_CLASSES, 'pl-8')}
                />
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <span className="type-caption">Set shown to:</span>
                {VENTURE_ATTENDANCE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setAllVisible(status)}
                    className="text-secondary-foreground border-input-border hover:bg-surface-hover hover:border-border-strong rounded-control border px-2 py-1 text-[12px] font-medium transition-colors"
                  >
                    {VENTURE_ATTENDANCE_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                size="sm"
                title="No matches"
                description={`Nobody on this roster matches “${query.trim()}”.`}
              />
            ) : (
              <ul className="divide-border divide-y">
                {visible.map((row) => {
                  const value = statusOf(row);
                  const dirty = value !== row.attendanceStatus;

                  return (
                    <li
                      key={row.recordId}
                      className={cn(
                        'flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5',
                        dirty && 'bg-primary-soft/40',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{row.studentName}</p>
                        <p className="type-caption truncate">{row.ventureName}</p>
                      </div>

                      {/* A radio group per student: one name, three choices, and
                          the browser handles arrow-key navigation for free. */}
                      <fieldset className="flex items-center gap-1">
                        <legend className="sr-only">Attendance for {row.studentName}</legend>

                        {VENTURE_ATTENDANCE_STATUSES.map((status) => {
                          const Icon = ICON[status];
                          const selected = value === status;

                          return (
                            <label
                              key={status}
                              className={cn(
                                'rounded-control inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                                selected
                                  ? status === 'PRESENT'
                                    ? 'border-success-border bg-success-soft text-success-soft-foreground'
                                    : status === 'ABSENT'
                                      ? 'border-danger-border bg-danger-soft text-danger-soft-foreground'
                                      : 'border-border bg-muted text-foreground'
                                  : 'border-input-border text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                              )}
                            >
                              <input
                                type="radio"
                                name={`attendance:${row.recordId}`}
                                value={status}
                                checked={selected}
                                onChange={() =>
                                  setDraft((current) => ({ ...current, [row.recordId]: status }))
                                }
                                className="sr-only"
                              />
                              <Icon className="size-3.5" aria-hidden="true" />
                              {VENTURE_ATTENDANCE_LABELS[status]}
                            </label>
                          );
                        })}
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
            )}

            <CardFooter>
              <span className="text-muted-foreground">
                {changed === 0
                  ? 'No unsaved changes.'
                  : `${changed} unsaved change${changed === 1 ? '' : 's'}.`}
              </span>

              <div className="ml-auto flex items-center gap-2">
                {changed > 0 ? (
                  <Button type="button" variant="secondary" onClick={() => setDraft({})}>
                    Discard
                  </Button>
                ) : null}
                <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
              </div>
            </CardFooter>
          </>
        )}
      </ActionForm>
    </Card>
  );
}

