import { MessageSquareQuote } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/dates';
import type {
  QuestionStat,
  WorkshopFeedbackView,
} from '@/services/workshops/workshopFeedbackService';
import type { ReactNode } from 'react';

/**
 * What students said about one workshop.
 *
 * Three readings of the same responses, in the order somebody asks for them:
 * how each question scored, what every student answered, and what they wrote.
 *
 * Every average is per question and is shown beside that question's own
 * spread. A 3.4 made of fives and ones is a different workshop from a 3.4 made
 * of threes, and an average printed on its own cannot tell those apart — which
 * is the whole reason the counts sit next to it rather than behind a click.
 * Nothing is ever averaged *across* questions: "the speaker" and "relevance"
 * are different things and one number covering both would say nothing.
 */

/**
 * The four scale questions.
 *
 * `header` is a short stand-in for the table, where the real question — two
 * lines of it, with the scale spelled out in brackets — would make the column
 * unreadable. The real wording is shown in full above the table, numbered to
 * match, and comes from the imported file rather than from here: every
 * workshop's form asks about that workshop.
 */
const RATINGS = [
  { field: 'overallRating', question: 'overall', header: 'Overall', number: 1 },
  { field: 'understandingRating', question: 'understanding', header: 'Understood', number: 2 },
  { field: 'speakerRating', question: 'speaker', header: 'Speaker', number: 3 },
  { field: 'relevanceRating', question: 'relevance', header: 'Relevance', number: 4 },
] as const;

/** Strips the leading "3)" so the number is not printed twice. */
function questionText(raw: string): string {
  return raw.replace(/^\s*\d+\s*[).:-]\s*/, '').trim();
}

/**
 * One question: what it asked, how it averaged, and how the answers fell.
 *
 * The spread is five rows of counts rather than a chart. The counts are what
 * somebody reads out in a meeting — "four people gave it a one" — and a chart
 * would make that number the thing you have to hover to find out.
 */
function QuestionCard({ stat }: { stat: QuestionStat }) {
  return (
    <div className="surface-sunken rounded-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="type-body min-w-0">
          <span className="text-muted-foreground mr-1.5 tabular-nums">Q{stat.number}.</span>
          {stat.question ? questionText(stat.question) : stat.label}
        </p>

        <span className="shrink-0 text-right">
          <span
            className={cn(
              'block text-xl leading-none font-semibold tabular-nums',
              stat.average === null
                ? 'text-muted-foreground'
                : stat.average >= 4
                  ? 'text-success'
                  : stat.average >= 3
                    ? 'text-warning'
                    : 'text-danger',
            )}
          >
            {stat.average === null ? '—' : stat.average.toFixed(1)}
          </span>
          <span className="type-caption">of 5</span>
        </span>
      </div>

      <div className="mt-3 space-y-1">
        {([5, 4, 3, 2, 1] as const).map((score) => {
          const count = stat.distribution[score];
          const percent = stat.answered === 0 ? 0 : (count / stat.answered) * 100;

          return (
            <div key={score} className="flex items-center gap-2">
              <span className="type-caption w-3 shrink-0 text-right tabular-nums">{score}</span>
              <span className="bg-surface h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    score >= 4 ? 'bg-success' : score === 3 ? 'bg-warning' : 'bg-danger',
                  )}
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="type-caption w-6 shrink-0 tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>

      <p className="type-caption mt-2.5">
        {stat.answered} answer{stat.answered === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** One student's answer to one question. */
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
  const { questions, stats } = summary;

  const columns: DataColumn[] = [
    { key: 'student', header: 'Student' },
    { key: 'roll', header: 'Roll No.', hideBelow: 'sm' },
    { key: 'date', header: 'Submitted', hideBelow: 'xl' },
    ...RATINGS.map((rating) => ({
      key: rating.field,
      header: rating.header,
      align: 'center' as const,
      hideBelow: 'md' as const,
    })),
    { key: 'feedback', header: 'Feedback', clamp: true },
  ];

  return (
    <Card>
      <CardHeader
        title="Student feedback"
        description={
          summary.responses === 0
            ? 'No feedback has been imported for this workshop yet.'
            : `${summary.responses} response${summary.responses === 1 ? '' : 's'} · ${summary.written} wrote a comment`
        }
        icon={MessageSquareQuote}
        action={action}
      />

      {stats.length > 0 ? (
        <CardBody className="border-b">
          <p className="type-overline mb-3">How each question scored</p>

          <div className="grid gap-4 lg:grid-cols-2">
            {stats.map((stat) => (
              <QuestionCard key={stat.key} stat={stat} />
            ))}
          </div>
        </CardBody>
      ) : null}

      {questions.takeaway ? (
        <CardBody className="border-b">
          <p className="type-overline mb-2">Question 5, written answers</p>
          <p className="type-body">{questionText(questions.takeaway)}</p>
          <p className="type-caption mt-1">
            {summary.written} of {summary.responses} answered this one.
          </p>
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
              node: <span className="font-medium">{row.studentName}</span>,
              sort: row.studentName,
              text: `${row.studentName} ${row.email}`,
            },
            textCell(row.rollNumber),
            {
              node: row.submittedAt ? (
                <span className="whitespace-nowrap">{formatDate(row.submittedAt)}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
              sort: row.submittedAt ?? '',
              text: row.submittedAt ? formatDate(row.submittedAt) : '',
            },
            ...RATINGS.map((rating) => {
              const value = row[rating.field];
              return {
                node: <Score value={value} />,
                // Unanswered sorts below a 1 rather than above a 5, which is
                // where an empty string would put it.
                sort: value ?? -1,
                text: value === null ? '' : String(value),
              };
            }),
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

      {/* The comments again, unclipped. The table has to clamp them to keep a
          row readable across seven columns; this is where they get read. */}
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
                    {row.overallRating === null ? null : (
                      <>
                        <span>· rated</span>
                        <Score value={row.overallRating} />
                      </>
                    )}
                  </p>
                </li>
              ))}
          </ul>
        </CardBody>
      ) : null}
    </Card>
  );
}
