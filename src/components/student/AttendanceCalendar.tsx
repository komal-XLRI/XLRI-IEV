'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/dates';
import type { AttendanceMark } from '@/lib/constants/status';

export interface AttendanceCalendarMark {
  /** ISO timestamp at UTC midnight — the day the register was taken. */
  date: string;
  status: AttendanceMark;
  activityCode: string;
  activityName: string;
  remarks: string;
}

/** What a whole day amounts to once every mark on it is read together. */
type DayState = 'PRESENT' | 'ABSENT' | 'MIXED';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Dates are stored at UTC midnight and read back in UTC everywhere else in the
 * application, so the calendar is built in UTC too. Building it in the
 * browser's timezone would slide every cell by a day for half the world.
 */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function keyOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Monday-first, matching how a week is read here. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function stateOf(marks: AttendanceCalendarMark[]): DayState {
  const present = marks.filter((mark) => mark.status === 'PRESENT').length;
  if (present === marks.length) return 'PRESENT';
  if (present === 0) return 'ABSENT';
  return 'MIXED';
}

const DAY_TONE: Record<DayState, string> = {
  PRESENT: 'border-success-border bg-success-soft/60 hover:border-success',
  ABSENT: 'border-danger-border bg-danger-soft/60 hover:border-danger',
  MIXED: 'border-warning-border bg-warning-soft/60 hover:border-warning',
};

const LETTER_TONE: Record<DayState, string> = {
  PRESENT: 'text-success-soft-foreground',
  ABSENT: 'text-danger-soft-foreground',
  MIXED: 'text-warning-soft-foreground',
};

const DAY_LETTER: Record<DayState, string> = { PRESENT: 'P', ABSENT: 'A', MIXED: 'P/A' };

const DAY_LABEL: Record<DayState, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  MIXED: 'Present and absent',
};

/**
 * A student's own attendance, a month at a time.
 *
 * The whole register is handed over at once and paged in the browser: a
 * student's marks number in the dozens, so a round trip per month would buy
 * nothing and cost the instant response that makes a calendar worth having.
 *
 * A day can carry more than one mark, because a Venture Activity is a work
 * window rather than a timetabled slot and several can be registered on the
 * same date. That is why a cell shows a state rather than a status, and why
 * "present and absent on the same day" is a state the grid can draw instead of
 * a case it has to hide.
 */
export function AttendanceCalendar({ marks }: { marks: AttendanceCalendarMark[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, AttendanceCalendarMark[]>();
    for (const mark of marks) {
      const key = keyOf(mark.date);
      map.set(key, [...(map.get(key) ?? []), mark]);
    }
    return map;
  }, [marks]);

  const today = useMemo(() => {
    const now = new Date();
    return {
      key: dayKey(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      month: now.getUTCFullYear() * 12 + now.getUTCMonth(),
    };
  }, []);

  /**
   * Opens on this month — except when this month is empty and some other month
   * is not, because a student who opens a blank grid has been told nothing.
   */
  const [month, setMonth] = useState(() => {
    const hasMarksThisMonth = marks.some((mark) => {
      const date = new Date(mark.date);
      return date.getUTCFullYear() * 12 + date.getUTCMonth() === today.month;
    });
    if (hasMarksThisMonth || marks.length === 0) return today.month;

    return marks.reduce((latest, mark) => {
      const date = new Date(mark.date);
      return Math.max(latest, date.getUTCFullYear() * 12 + date.getUTCMonth());
    }, 0);
  });

  const [selected, setSelected] = useState<string | null>(null);

  const year = Math.floor(month / 12);
  const monthOfYear = month % 12;

  const cells = useMemo(() => {
    const blanks = leadingBlanks(year, monthOfYear);
    const total = daysInMonth(year, monthOfYear);

    const days: Array<number | null> = [
      ...Array.from({ length: blanks }, () => null),
      ...Array.from({ length: total }, (_, index) => index + 1),
    ];

    // Complete the final week so the grid keeps its shape from month to month.
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [year, monthOfYear]);

  /** Counts for the month on screen, not for the student's whole record. */
  const summary = useMemo(() => {
    const inMonth = marks.filter((mark) => {
      const date = new Date(mark.date);
      return date.getUTCFullYear() === year && date.getUTCMonth() === monthOfYear;
    });

    const present = inMonth.filter((mark) => mark.status === 'PRESENT').length;

    return {
      sessions: inMonth.length,
      present,
      absent: inMonth.length - present,
      rate: inMonth.length === 0 ? null : Math.round((present / inMonth.length) * 100),
    };
  }, [marks, year, monthOfYear]);

  const selectedMarks = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* Month, and what it adds up to                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-border bg-surface rounded-card flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border px-4 py-3">
        <div className="flex items-center gap-2">
          <MonthButton
            label="Previous month"
            icon={ChevronLeft}
            onClick={() => {
              setMonth(month - 1);
              setSelected(null);
            }}
          />

          <span className="inline-flex items-center gap-2 px-1">
            <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
            <span className="text-[15px] font-semibold whitespace-nowrap">
              {MONTH_FORMAT.format(new Date(Date.UTC(year, monthOfYear, 1)))}
            </span>
          </span>

          <MonthButton
            label="Next month"
            icon={ChevronRight}
            onClick={() => {
              setMonth(month + 1);
              setSelected(null);
            }}
          />

          {month === today.month ? null : (
            <button
              type="button"
              onClick={() => {
                setMonth(today.month);
                setSelected(null);
              }}
              className="bg-primary text-primary-foreground rounded-control ml-1 px-2.5 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-90"
            >
              This month
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="Present" count={summary.present} tone="success" />
          <Chip label="Absent" count={summary.absent} tone="danger" />
          <Chip label="Sessions" count={summary.sessions} tone="neutral" />
          {summary.rate === null ? null : (
            <span className="border-border bg-muted text-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
              {summary.rate}% attended
            </span>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The month                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-border bg-surface rounded-card border p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="text-muted-foreground pb-1 text-center text-[11px] font-semibold tracking-wide uppercase"
            >
              <span className="hidden sm:inline">{weekday}</span>
              <span className="sm:hidden">{weekday.charAt(0)}</span>
            </div>
          ))}

          {cells.map((day, index) => {
            if (day === null) return <div key={`blank-${index}`} aria-hidden="true" />;

            const key = dayKey(year, monthOfYear, day);
            const dayMarks = byDay.get(key) ?? [];
            const state = dayMarks.length > 0 ? stateOf(dayMarks) : null;
            const isToday = key === today.key;
            const isFuture = key > today.key;

            return (
              <DayCell
                key={key}
                day={day}
                state={state}
                marks={dayMarks}
                isToday={isToday}
                isFuture={isFuture}
                isSelected={selected === key}
                onSelect={() => setSelected(selected === key ? null : key)}
              />
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* What the selected day actually says                               */}
      {/* ---------------------------------------------------------------- */}
      {selected && selectedMarks.length > 0 ? (
        <div className="border-border bg-surface rounded-card border px-4 py-3">
          <p className="type-card-title mb-2">{formatDate(selected)}</p>

          <ul className="space-y-1.5">
            {selectedMarks.map((mark) => (
              <li
                key={`${mark.activityCode}-${mark.status}-${mark.remarks}`}
                className="surface-sunken rounded-control flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2"
              >
                <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                  {mark.activityCode}
                </span>
                <span className="text-[13.5px] font-medium">{mark.activityName}</span>
                <span
                  className={cn(
                    'text-[13px] font-semibold',
                    mark.status === 'PRESENT'
                      ? 'text-success-soft-foreground'
                      : 'text-danger-soft-foreground',
                  )}
                >
                  {mark.status === 'PRESENT' ? 'Present' : 'Absent'}
                </span>
                {/* The remark is the programme office's note on this mark, and
                    the student is entitled to read it. */}
                {mark.remarks ? (
                  <span className="type-caption min-w-0 flex-1">{mark.remarks}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Legend />
    </div>
  );
}

function DayCell({
  day,
  state,
  marks,
  isToday,
  isFuture,
  isSelected,
  onSelect,
}: {
  day: number;
  state: DayState | null;
  marks: AttendanceCalendarMark[];
  isToday: boolean;
  isFuture: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const shell = cn(
    'rounded-control flex h-20 flex-col border p-1.5 text-left transition-colors sm:h-[86px] sm:p-2',
    state
      ? DAY_TONE[state]
      : isFuture
        ? // A day that has not happened is drawn as an outline: nothing is
          // missing from it yet, and a solid empty cell reads as a gap.
          'border-border border-dashed bg-transparent'
        : 'border-border bg-surface',
    isToday && 'ring-primary ring-2 ring-offset-1 ring-offset-transparent',
    isSelected && 'ring-foreground ring-2 ring-offset-1 ring-offset-transparent',
  );

  const body = (
    <>
      <span className="flex items-start justify-between gap-1">
        <span
          className={cn(
            'text-[13px] font-semibold tabular-nums',
            state || isToday ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {day}
        </span>

        {state ? (
          <span className={cn('text-[11px] font-bold', LETTER_TONE[state])}>
            {DAY_LETTER[state]}
          </span>
        ) : null}
      </span>

      {state ? (
        <span className="mt-auto min-w-0">
          <span className="type-caption block truncate font-medium">
            {marks.length === 1 ? marks[0].activityCode : `${marks.length} sessions`}
          </span>
        </span>
      ) : isToday ? (
        <span className="text-primary mt-auto text-[11px] font-semibold">Today</span>
      ) : null}
    </>
  );

  if (!state) {
    return (
      <div className={shell} aria-hidden={marks.length === 0 ? undefined : true}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${day}: ${DAY_LABEL[state]}, ${marks.length} session(s)`}
      className={cn(shell, 'cursor-pointer')}
    >
      {body}
    </button>
  );
}

function MonthButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof ChevronLeft;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center border transition-colors"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

const CHIP_TONE = {
  success: 'border-success-border bg-success-soft text-success-soft-foreground',
  danger: 'border-danger-border bg-danger-soft text-danger-soft-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const;

function Chip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: keyof typeof CHIP_TONE;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        // A zero is stated plainly rather than coloured: nought absences is
        // not a warning, and a red 0 reads as one at a glance.
        count === 0 ? CHIP_TONE.neutral : CHIP_TONE[tone],
      )}
    >
      {label}
      <span className="font-semibold tabular-nums">{count}</span>
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LegendKey letter="P" label="Present" className={CHIP_TONE.success} />
      <LegendKey letter="A" label="Absent" className={CHIP_TONE.danger} />
      <LegendKey
        letter="P/A"
        label="Both on one day"
        className="border-warning-border bg-warning-soft text-warning-soft-foreground"
      />
      <LegendKey letter="·" label="No session recorded" className={CHIP_TONE.neutral} />
    </div>
  );
}

function LegendKey({
  letter,
  label,
  className,
}: {
  letter: string;
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap',
        className,
      )}
    >
      <span className="font-bold">{letter}</span>
      {label}
    </span>
  );
}
