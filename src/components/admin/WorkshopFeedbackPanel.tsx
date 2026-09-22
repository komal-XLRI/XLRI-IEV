import { MessageSquareQuote, Star } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/dates';
import {
  FEEDBACK_QUESTIONS,
  type WorkshopFeedbackView,
} from '@/services/workshops/workshopFeedbackService';
import type { ReactNode } from 'react';

/**
 * What a cohort said about one workshop.
 *
 * Averages lead, because that is the question anyone opens this to answer, but
 * they never stand alone: a 3.4 made of fives and ones is a different workshop
 * from a 3.4 made of threes, so the spread of the overall score sits beside it.
 * Written comments are kept whole and unclipped further down — a takeaway
 * truncated to one line is the one part of this page nobody can act on.
 */

/** A 1–5 average as a filled bar. Null when nobody answered that question. */
function RatingBar({ label, value }: { label: string; value: number | null }) {
  const percent = value === null ? 0 : (value / 5) * 100;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-caption truncate">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">
          {value === null ? <span className="text-muted-foreground text-sm">—</span> : value}
        </span>
      </div>
      <div className="surface-sunken mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full',
            value === null
              ? 'bg-transparent'
              : value >= 4
                ? 'bg-success'
                : value >= 3
                  ? 'bg-warning'
                  : 'bg-danger',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** One student's answer to one question, as a compact score. */
function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;

  return (
    <span
      className={cn(
        'inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 text-[13px] font-semibold tabular-nums',
        value >= 4
          ? 'bg-success-soft text-success-soft-foreground'
          : value === 3
            ? 'bg-warning-soft text-warning-soft-foreground'
            : 'bg-danger-soft text-danger-soft-foreground',
      )}
    >
      {value}
    </span>
  );
}

export function WorkshopFeedbackPanel({
  feedback,
  action,
}: {
  feedback: WorkshopFeedbackView;
  /** The import control, supplied by the page so this stays a server component. */
  action?: ReactNode;
}) {
  const { summary, rows } = feedback;

  const columns: DataColumn[] = [
    { key: 'student', header: 'Student' },
    { key: 'roll', header: 'Roll No.', hideBelow: 'sm' },
    { key: 'overall', header: 'Overall', align: 'center' },
    { key: 'understanding', header: 'Understood', align: 'center', hideBelow: 'md' },
    { key: 'speaker', header: 'Speaker', align: 'center', hideBelow: 'md' },
    { key: 'relevance', header: 'Relevance', align: 'center', hideBelow: 'md' },
    { key: 'takeaway', header: 'Key takeaway', hideBelow: 'lg', clamp: true },
  ];

  const score = (value: number | null) => ({
    node: <Score value={value} />,
    sort: value ?? -1,
    text: value === null ? '' : String(value),
  });

  return (
    <Card>
      <CardHeader
        title="Student feedback"
        description={
          summary.responses === 0
            ? 'No feedback has been imported for this workshop yet.'
            : `${summary.responses} response${summary.responses === 1 ? '' : 's'} from ${summary.cohort} student${summary.cohort === 1 ? '' : 's'} · ${summary.written} wrote a comment`
        }
        icon={MessageSquareQuote}
        action={action}
      />

      {summary.responses > 0 ? (
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEEDBACK_QUESTIONS.map((question) => (
              <RatingBar
                key={question.field}
                label={question.label}
                value={summary.averages[question.field]}
              />
            ))}
          </div>

          {/* How the overall score is made up. Five rows rather than a chart:
              the counts are what somebody reads out in a meeting. */}
          <div className="surface-sunken rounded-card space-y-1.5 p-3">
            <p className="type-overline flex items-center gap-1.5">
              <Star className="size-3" aria-hidden="true" />
              Overall quality, response by response
            </p>

            {([5, 4, 3, 2, 1] as const).map((value) => {
              const count = summary.distribution[value];
              const percent = summary.responses === 0 ? 0 : (count / summary.responses) * 100;

              return (
                <div key={value} className="flex items-center gap-2.5">
                  <span className="type-caption w-3 shrink-0 text-right tabular-nums">{value}</span>
                  <span className="bg-surface h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        value >= 4 ? 'bg-success' : value === 3 ? 'bg-warning' : 'bg-danger',
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="type-caption w-8 shrink-0 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </CardBody>
      ) : null}

      <DataTable
        caption="Student feedback"
        columns={columns}
        searchPlaceholder="Search a student, roll number or comment"
        emptyTitle="No feedback imported"
        emptyDescription="Import the feedback form export for this workshop to see what students said."
        rows={rows.map((row) => ({
          id: row._id,
          cells: [
            {
              node: (
                <span className="min-w-0">
                  <span className="block font-medium">{row.studentName}</span>
                  {row.submittedAt ? (
                    <span className="type-caption block">{formatDate(row.submittedAt)}</span>
                  ) : null}
                </span>
              ),
              sort: row.studentName,
              text: `${row.studentName} ${row.email}`,
            },
            textCell(row.rollNumber),
            score(row.overallRating),
            score(row.understandingRating),
            score(row.speakerRating),
            score(row.relevanceRating),
            {
              node: row.takeaway ? (
                <span className="type-secondary">{row.takeaway}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
              sort: row.takeaway,
              text: row.takeaway,
            },
          ],
        }))}
      />

      {/* The comments again, in full. The table clamps them so the scores stay
          readable across a row; this is where somebody actually reads them. */}
      {summary.written > 0 ? (
        <CardBody className="border-t">
          <p className="type-overline mb-3">In their own words</p>

          <ul className="space-y-3">
            {rows
              .filter((row) => row.takeaway.trim() !== '')
              .map((row) => (
                <li key={row._id} className="surface-sunken rounded-card p-3">
                  <p className="type-body whitespace-pre-line">{row.takeaway}</p>
                  <p className="type-caption mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{row.studentName}</span>
                    {row.rollNumber ? <span>· {row.rollNumber}</span> : null}
                    <span>· rated</span>
                    <Score value={row.overallRating} />
                  </p>
                </li>
              ))}
          </ul>
        </CardBody>
      ) : null}
    </Card>
  );
}
