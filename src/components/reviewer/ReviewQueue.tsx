import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Badge, ReviewStatusBadge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils/dates';
import type { ReviewStatus } from '@/lib/constants/status';

export interface QueueRow {
  recordId: string;
  submissionId: string | null;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  maxAttempts: number;
  myReviewStatus: ReviewStatus;
  otherReviewStatus: ReviewStatus;
  updatedAt: string;
}

/**
 * A reviewer's work list.
 *
 * The other reviewer's verdict is a column, not a footnote: knowing that the
 * mentor has already approved changes what a faculty member's decision does —
 * it completes the activity rather than leaving it under review.
 */
export function ReviewQueue({
  rows,
  basePath,
  otherLabel,
  emptyTitle,
  emptyDescription,
  title,
  description,
}: {
  rows: QueueRow[];
  basePath: string;
  otherLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  title: string;
  description: string;
}) {
  const columns: DataColumn[] = [
    { key: 'student', header: 'Student' },
    { key: 'venture', header: 'Venture', hideBelow: 'lg' },
    { key: 'activity', header: 'Activity' },
    { key: 'attempt', header: 'Attempt', align: 'center', hideBelow: 'sm' },
    { key: 'mine', header: 'Your verdict' },
    { key: 'other', header: otherLabel, hideBelow: 'md' },
    { key: 'updated', header: 'Updated', align: 'right', hideBelow: 'xl' },
    { key: 'action', header: '', align: 'right', sortable: false },
  ];

  const dataRows: DataRow[] = rows.map((row) => ({
    id: row.recordId,
    cells: [
      {
        node: (
          <span className="block min-w-0">
            <span className="block truncate font-medium">{row.studentName}</span>
            <span className="type-caption block truncate">{row.studentEmail}</span>
          </span>
        ),
        sort: row.studentName,
        text: `${row.studentName} ${row.studentEmail}`,
      },
      textCell(row.ventureName),
      {
        node: (
          <span>
            <span className="font-mono text-xs font-semibold">{row.activityCode}</span>{' '}
            <span className="text-muted-foreground">{row.activityName}</span>
          </span>
        ),
        sort: row.activityCode,
        text: `${row.activityCode} ${row.activityName}`,
      },
      {
        node: (
          <span className="tabular-nums">
            {row.attemptNumber}
            <span className="text-muted-foreground"> / {row.maxAttempts}</span>
          </span>
        ),
        sort: row.attemptNumber,
        text: `attempt ${row.attemptNumber}`,
      },
      {
        node: <ReviewStatusBadge status={row.myReviewStatus} />,
        sort: row.myReviewStatus,
        text: row.myReviewStatus,
      },
      {
        node: <ReviewStatusBadge status={row.otherReviewStatus} />,
        sort: row.otherReviewStatus,
        text: row.otherReviewStatus,
      },
      {
        node: <span className="text-muted-foreground">{formatDate(row.updatedAt)}</span>,
        sort: row.updatedAt,
        text: formatDate(row.updatedAt),
      },
      {
        node: row.submissionId ? (
          <Link
            href={`${basePath}/submissions/${row.submissionId}`}
            className="text-primary text-[13px] font-medium hover:underline"
          >
            {row.myReviewStatus === 'PENDING' ? 'Review' : 'Open'}
          </Link>
        ) : (
          <Badge tone="muted">No submission</Badge>
        ),
      },
    ],
  }));

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <DataTable
        caption={title}
        columns={columns}
        rows={dataRows}
        searchPlaceholder="Search student, venture or activity"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        pageSize={15}
      />
    </Card>
  );
}
