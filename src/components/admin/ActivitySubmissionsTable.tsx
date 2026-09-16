'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Paperclip } from 'lucide-react';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { ActivityStatusBadge } from '@/components/ui/Badge';
import { DualReviewInline } from '@/components/venture/ReviewProgress';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { formatDateTime } from '@/lib/utils/dates';
import type { ReviewStatus, UiActivityState } from '@/lib/constants/status';

export interface ActivitySubmissionRow {
  recordId: string;
  submissionId: string | null;
  studentId: string;
  studentName: string;
  ventureName: string;
  status: string;
  attemptNumber: number;
  maxAttempts: number;
  submittedAt: string | null;
  facultyReviewStatus: string;
  mentorReviewStatus: string;
  evidenceCount: number;
}

const COLUMNS: DataColumn[] = [
  { key: 'student', header: 'Student' },
  { key: 'venture', header: 'Venture', hideBelow: 'lg', toggleable: true },
  { key: 'status', header: 'Status' },
  { key: 'attempt', header: 'Attempt', align: 'center', hideBelow: 'md' },
  { key: 'submitted', header: 'Submitted', hideBelow: 'sm' },
  { key: 'files', header: 'Files', align: 'center', hideBelow: 'md' },
  { key: 'reviews', header: 'Faculty / mentor', sortable: false },
  { key: 'actions', header: '', align: 'right', sortable: false },
];

/**
 * Everyone on one venture activity, submitted or not.
 *
 * The row is the way in to the submission itself, where the work, the files
 * and both halves of the review are. Nothing is decided from this table: a
 * verdict filed off a row in a list is one filed without reading the attempt.
 */
export function ActivitySubmissionsTable({ rows }: { rows: ActivitySubmissionRow[] }) {
  const [only, setOnly] = useState<'ALL' | 'AWAITING' | 'SUBMITTED' | 'NOT_SUBMITTED'>('ALL');

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (only === 'AWAITING') return row.status === 'UNDER_REVIEW';
        if (only === 'SUBMITTED') return row.submissionId !== null;
        if (only === 'NOT_SUBMITTED') return row.submissionId === null;
        return true;
      }),
    [rows, only],
  );

  const dataRows: DataRow[] = filtered.map((row) => ({
    id: row.recordId,
    cells: [
      {
        node: row.submissionId ? (
          <Link
            href={`/admin/reviews/${row.submissionId}`}
            className="hover:text-primary font-medium hover:underline"
          >
            {row.studentName}
          </Link>
        ) : (
          <span className="font-medium">{row.studentName}</span>
        ),
        sort: row.studentName,
        text: row.studentName,
      },
      textCell(row.ventureName),
      {
        node: <ActivityStatusBadge state={row.status as UiActivityState} />,
        sort: row.status,
        text: row.status,
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
        node: row.submittedAt ? (
          <span className="text-muted-foreground whitespace-nowrap">
            {formatDateTime(row.submittedAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">Not submitted</span>
        ),
        sort: row.submittedAt ?? '',
        text: row.submittedAt ? formatDateTime(row.submittedAt) : 'not submitted',
      },
      {
        node:
          row.evidenceCount > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {row.evidenceCount}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        sort: row.evidenceCount,
        text: `${row.evidenceCount} files`,
      },
      {
        node: row.submissionId ? (
          <DualReviewInline
            facultyStatus={row.facultyReviewStatus as ReviewStatus}
            mentorStatus={row.mentorReviewStatus as ReviewStatus}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
        text: `${row.facultyReviewStatus} ${row.mentorReviewStatus}`,
      },
      {
        node: row.submissionId ? (
          <Link
            href={`/admin/reviews/${row.submissionId}`}
            className="bg-secondary text-secondary-foreground border-input-border hover:bg-secondary-hover hover:border-border-strong inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
          >
            Open &amp; review
          </Link>
        ) : (
          <span className="type-caption">Nothing to open</span>
        ),
      },
    ],
  }));

  return (
    <DataTable
      caption="Student submissions on this activity"
      columns={COLUMNS}
      rows={dataRows}
      searchPlaceholder="Search student or venture"
      emptyTitle={only === 'ALL' ? 'No students on this activity' : 'Nothing matches this filter'}
      emptyDescription={
        only === 'ALL'
          ? 'Records appear here once students are assigned ventures and this activity opens.'
          : 'Clear the filter to see everyone on this activity.'
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="activity-submission-filter">
            Filter submissions
          </label>
          <select
            id="activity-submission-filter"
            value={only}
            onChange={(event) => setOnly(event.target.value as typeof only)}
            className={COMPACT_CONTROL_CLASSES}
          >
            <option value="ALL">Everyone</option>
            <option value="AWAITING">Awaiting a verdict</option>
            <option value="SUBMITTED">Has submitted</option>
            <option value="NOT_SUBMITTED">Not submitted</option>
          </select>

          <span className="type-caption">
            {filtered.length} of {rows.length} student(s)
          </span>
        </div>
      }
    />
  );
}
