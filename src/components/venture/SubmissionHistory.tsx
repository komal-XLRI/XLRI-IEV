import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils/dates';
import { EvidenceList } from './EvidenceList';

export interface HistoryEntry {
  submission: {
    _id: string;
    attemptNumber: number;
    submissionType: string;
    title?: string;
    content?: string;
    remarks?: string;
    submittedAt: string;
  };
  reviews: Array<{
    _id: string;
    reviewerType: string;
    status: string;
    comments?: string;
    reviewedAt: string;
    reviewerId?: { name: string } | null;
  }>;
  evidence: Array<{
    _id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

const DECISION_TONE = {
  APPROVED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
} as const;

/**
 * Full attempt history, newest first. Previous attempts and their reviews are
 * immutable — a resubmission adds a record, it never edits one.
 */
export function SubmissionHistory({
  entries,
  emptyMessage,
}: {
  entries: HistoryEntry[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Submission history"
        description={`${entries.length} attempt(s) · preserved permanently`}
      />
      {entries.length === 0 ? (
        <EmptyState title="No submissions yet" description={emptyMessage} />
      ) : (
        <ul className="divide-y">
          {entries.map(({ submission, reviews, evidence }) => (
            <li key={submission._id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Attempt {submission.attemptNumber}</span>
                <Badge tone="neutral">{submission.submissionType.toLowerCase()}</Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(submission.submittedAt)}
                </span>
              </div>

              {submission.title ? (
                <p className="mt-2 text-sm font-medium">{submission.title}</p>
              ) : null}
              {submission.content ? (
                <p className="mt-1 text-sm whitespace-pre-wrap">{submission.content}</p>
              ) : null}
              {submission.remarks ? (
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                  Remarks: {submission.remarks}
                </p>
              ) : null}

              {evidence.length > 0 ? (
                <div className="mt-3">
                  <EvidenceList evidence={evidence} />
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {reviews.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Awaiting both reviews.</p>
                ) : (
                  reviews.map((review) => (
                    <div key={review._id} className="surface-sunken rounded-lg px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={review.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
                          {review.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                        </Badge>
                        <Badge
                          tone={
                            DECISION_TONE[review.status as keyof typeof DECISION_TONE] ?? 'neutral'
                          }
                        >
                          {review.status.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {review.reviewerId?.name} · {formatDateTime(review.reviewedAt)}
                        </span>
                      </div>
                      {review.comments ? (
                        <p className="mt-1.5 text-sm whitespace-pre-wrap">{review.comments}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
