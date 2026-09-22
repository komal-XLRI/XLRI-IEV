import { MessageSquareQuote } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { formatDate } from '@/lib/utils/dates';
import type { WorkshopFeedbackView } from '@/services/workshops/workshopFeedbackService';
import type { ReactNode } from 'react';

/**
 * What students said about one workshop.
 *
 * A list of responses and nothing else — no averages, no distribution, no
 * scoring of any kind. This started out with all of that and the programme
 * office did not want it: what the office keeps is the record of what each
 * student wrote, and a page that led with a number was answering a question
 * nobody had asked.
 *
 * Comments are shown in full rather than clipped to fit a row. A truncated
 * comment is the one thing on this page that cannot be acted on.
 */
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
    { key: 'date', header: 'Submitted', hideBelow: 'md' },
    { key: 'feedback', header: 'Feedback' },
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
            {
              node: row.takeaway ? (
                <span className="type-body whitespace-pre-line">{row.takeaway}</span>
              ) : (
                <span className="text-muted-foreground">Left blank</span>
              ),
              sort: row.takeaway,
              text: row.takeaway,
            },
          ],
        }))}
      />
    </Card>
  );
}
