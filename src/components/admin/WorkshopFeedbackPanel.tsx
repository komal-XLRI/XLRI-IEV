import { MessageSquareQuote } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/dates';
import type { WorkshopFeedbackView } from '@/services/workshops/workshopFeedbackService';
import type { ReactNode } from 'react';

/**
 * What students said about one workshop.
 *
 * Every answer each student gave — all four ratings and their comment — and
 * nothing derived from them. There are deliberately no averages here: this
 * page had them, and the programme office did not want a workshop reduced to
 * a number. A rating means something as one student's answer; the mean of
 * twelve of them was answering a question nobody asked.
 *
 * So the ratings are shown per person, in the row belonging to the person who
 * gave them, and the comments are repeated in full underneath where they can
 * actually be read.
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
  const { questions } = summary;

  // Only what this form actually asked. A sheet with no rating columns leaves
  // this empty, and the block does not appear at all.
  const asked = [
    ...RATINGS.map((rating) => ({
      number: rating.number,
      label: rating.header,
      text: questions[rating.question],
    })),
    { number: 5, label: 'Feedback', text: questions.takeaway },
  ].filter((entry): entry is { number: number; label: string; text: string } =>
    Boolean(entry.text),
  );

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

      {asked.length > 0 ? (
        <CardBody className="border-b">
          <p className="type-overline mb-3">Questions asked on this form</p>

          <ol className="space-y-2">
            {asked.map((entry) => (
              <li key={entry.number} className="flex gap-2.5">
                <span className="type-caption w-4 shrink-0 pt-0.5 text-right tabular-nums">
                  {entry.number}.
                </span>
                <span className="min-w-0">
                  <span className="type-body">{questionText(entry.text)}</span>{' '}
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap">
                    {entry.label}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <p className="type-caption mt-3">
            The short labels are how these questions are headed in the table below.
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
