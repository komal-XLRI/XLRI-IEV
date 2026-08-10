'use client';

import { CheckCircle2 } from 'lucide-react';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Badge } from '@/components/ui/Badge';
import { DualReviewInline } from '@/components/venture/ReviewProgress';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import type { ReviewStatus, ReviewerType } from '@/lib/constants/status';

export interface PendingRow {
  recordId: string;
  studentName: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  maxAttempts: number;
  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  awaitingSince: string;
}

export interface HistoryRow {
  id: string;
  reviewedAt: string;
  reviewerName: string;
  reviewerType: ReviewerType;
  status: 'APPROVED' | 'REVISION_REQUIRED' | 'REJECTED';
  comments: string | null;
}

const DECISION_TONE = {
  APPROVED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
} as const;

const DECISION_LABEL = {
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision required',
  REJECTED: 'Rejected',
} as const;

/**
 * Attempts still waiting on a verdict.
 *
 * Both reviewers' states are shown on every row rather than one combined
 * status, because "faculty approved, mentor pending" and "both pending" need
 * completely different follow-up and the summary status cannot tell them apart.
 */
export function PendingReviewTable({ rows }: { rows: PendingRow[] }) {
  const columns: DataColumn[] = [
    { key: 'student', header: 'Student' },
    { key: 'venture', header: 'Venture', hideBelow: 'md' },
    { key: 'activity', header: 'Activity' },
    { key: 'attempt', header: 'Attempt', align: 'center', hideBelow: 'lg' },
    { key: 'reviews', header: 'Faculty / mentor', sortable: false },
    { key: 'since', header: 'Waiting since', align: 'right', hideBelow: 'sm' },
  ];

  const dataRows: DataRow[] = rows.map((row) => ({
    id: row.recordId,
    cells: [
      {
        node: <span className="font-medium">{row.studentName}</span>,
        sort: row.studentName,
        text: row.studentName,
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
        node: (
          <DualReviewInline
            facultyStatus={row.facultyReviewStatus}
            mentorStatus={row.mentorReviewStatus}
          />
        ),
        text: `${row.facultyReviewStatus} ${row.mentorReviewStatus}`,
      },
      {
        node: <span className="text-muted-foreground">{formatDate(row.awaitingSince)}</span>,
        sort: row.awaitingSince,
        text: formatDate(row.awaitingSince),
      },
    ],
  }));

  return (
    <DataTable
      caption="Attempts awaiting a review verdict"
      columns={columns}
      rows={dataRows}
      searchPlaceholder="Search student, venture or activity"
      emptyTitle="No pending reviews"
      emptyDescription="All submitted activities have been reviewed. You're all caught up."
      pageSize={15}
    />
  );
}

/** Immutable verdict log — recorded reviews are never edited or deleted. */
export function ReviewHistoryTable({ rows }: { rows: HistoryRow[] }) {
  const columns: DataColumn[] = [
    { key: 'reviewed', header: 'Reviewed' },
    { key: 'reviewer', header: 'Reviewer' },
    { key: 'type', header: 'Type', hideBelow: 'sm' },
    { key: 'decision', header: 'Decision' },
    { key: 'comments', header: 'Comments', hideBelow: 'lg', clamp: true, sortable: false },
  ];

  const dataRows: DataRow[] = rows.map((row) => ({
    id: row.id,
    cells: [
      {
        node: (
          <span className="text-muted-foreground whitespace-nowrap">
            {formatDateTime(row.reviewedAt)}
          </span>
        ),
        sort: row.reviewedAt,
        text: formatDateTime(row.reviewedAt),
      },
      {
        node: <span className="font-medium">{row.reviewerName}</span>,
        sort: row.reviewerName,
        text: row.reviewerName,
      },
      {
        node: (
          <Badge tone={row.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
            {row.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
          </Badge>
        ),
        sort: row.reviewerType,
        text: row.reviewerType,
      },
      {
        node: (
          <Badge
            tone={DECISION_TONE[row.status]}
            icon={row.status === 'APPROVED' ? CheckCircle2 : undefined}
          >
            {DECISION_LABEL[row.status]}
          </Badge>
        ),
        sort: row.status,
        text: DECISION_LABEL[row.status],
      },
      {
        node: row.comments ? (
          <span className="text-muted-foreground" title={row.comments}>
            {row.comments}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
        text: row.comments ?? '',
      },
    ],
  }));

  return (
    <DataTable
      caption="Recorded review verdicts"
      columns={columns}
      rows={dataRows}
      searchPlaceholder="Search reviewer or comments"
      emptyTitle="No reviews match this filter"
      emptyDescription="Change the filter above to see other verdicts."
      pageSize={25}
    />
  );
}
