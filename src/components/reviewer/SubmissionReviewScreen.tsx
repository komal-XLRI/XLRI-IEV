import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { Card, CardBody, CardHeader, StatTile } from '@/components/ui/Card';
import { PageHeader } from '@/components/layout/AppShell';
import { ActivityStatusBadge, Badge, ReviewStatusBadge } from '@/components/ui/Badge';
import { EvidenceList } from '@/components/venture/EvidenceList';
import { ReviewForm } from './ReviewForm';
import { getSubmissionBundle } from '@/services/submissions/submissionService';
import { getAssignedReviewers, getPreviousFeedback } from '@/services/reviews/reviewService';
import { canReview } from '@/lib/permissions/reviewAccess';
import { formatDateRange, formatDateTime } from '@/lib/utils/dates';
import { isValidObjectId } from '@/lib/utils/ids';
import { serialize } from '@/lib/utils/serialize';
import type { Role } from '@/lib/constants/roles';
import type { ReviewerType } from '@/lib/constants/status';

const DECISION_TONE = {
  APPROVED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
} as const;

/**
 * The review screen. Shared by Faculty, Mentor and Admin.
 *
 * For a reviewer, the reviewer type is taken from the signed-in role and
 * assignment is re-checked here as well as in the service that records the
 * verdict — one half of the dual review, theirs.
 *
 * An administrator is not a reviewer and gets no half of their own. They see
 * both, and can file either one for the person it is assigned to, which is the
 * same screen doing the same thing twice rather than a second, lesser way to
 * review. Everything that constrains a reviewer still applies: the rules live
 * in `createReviewOnBehalf`, not here.
 */
export async function SubmissionReviewScreen({
  submissionId,
  reviewer,
  basePath,
}: {
  submissionId: string;
  reviewer: { userId: string; role: Extract<Role, 'FACULTY' | 'MENTOR' | 'ADMIN'> };
  basePath: string;
}) {
  if (!isValidObjectId(submissionId)) notFound();

  const bundle = await getSubmissionBundle(submissionId);
  const { submission, record, venture, activity, reviews, evidence } = bundle;

  const isAdmin = reviewer.role === 'ADMIN';

  const reviewerType: ReviewerType | null = isAdmin ? null : assignedType();

  function assignedType(): ReviewerType {
    const permission = canReview(
      reviewer.role,
      { facultyId: venture.facultyId, mentorId: venture.mentorId },
      reviewer.userId,
    );
    if (!permission.allowed || !permission.reviewerType) forbidden();
    return permission.reviewerType;
  }

  const facultyReview = reviews.find((r) => r.reviewerType === 'FACULTY') ?? null;
  const mentorReview = reviews.find((r) => r.reviewerType === 'MENTOR') ?? null;

  const myReview = reviewerType === 'FACULTY' ? facultyReview : mentorReview;
  const otherReview = reviewerType === 'FACULTY' ? mentorReview : facultyReview;

  const myStatus =
    reviewerType === 'FACULTY' ? record.facultyReviewStatus : record.mentorReviewStatus;
  const otherStatus =
    reviewerType === 'FACULTY' ? record.mentorReviewStatus : record.facultyReviewStatus;

  const isCurrentAttempt = submission.attemptNumber === record.attemptNumber;
  const previousFeedback = (await getPreviousFeedback(record._id.toString())).filter(
    (entry) => entry.attemptNumber < submission.attemptNumber,
  );

  // Only an administrator needs these: a reviewer is one of them and never
  // files for the other.
  const assigned = isAdmin
    ? await getAssignedReviewers(record.studentVentureId.toString())
    : { facultyName: null, mentorName: null };

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description={`${venture.studentId?.name ?? 'Unknown student'} · ${venture.ventureName}`}
        action={
          <Link href={basePath} className="text-primary text-sm hover:underline">
            Back to queue
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ActivityStatusBadge state={record.status} />
        <ReviewStatusBadge prefix="Faculty" status={record.facultyReviewStatus} />
        <ReviewStatusBadge prefix="Mentor" status={record.mentorReviewStatus} />
        {!isCurrentAttempt ? <Badge tone="muted">Superseded attempt</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Attempt" value={`${submission.attemptNumber} / ${activity.maxAttempts}`} />
        <StatTile label="Type" value={submission.submissionType.toLowerCase()} />
        <StatTile label="Submitted" value={formatDateTime(submission.submittedAt)} />
        <StatTile
          label="Activity window"
          value={formatDateRange(activity.startDate, activity.endDate)}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Submission" description={submission.title || undefined} />
            <CardBody className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">
                {submission.content || 'No description provided.'}
              </p>

              {submission.remarks ? (
                <div className="surface-sunken rounded-lg p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Student remarks
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{submission.remarks}</p>
                </div>
              ) : null}

              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                  Evidence ({evidence.length})
                </p>
                {evidence.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {activity.evidenceRequired
                      ? 'No evidence uploaded — this activity expects supporting files.'
                      : 'No evidence uploaded.'}
                  </p>
                ) : (
                  <EvidenceList evidence={serialize(evidence)} />
                )}
              </div>
            </CardBody>
          </Card>

          {previousFeedback.length > 0 ? (
            <Card>
              <CardHeader
                title="Previous feedback"
                description="Comments from earlier attempts on this activity."
              />
              <ul className="divide-y">
                {previousFeedback.map((entry) => (
                  <li key={entry._id.toString()} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="muted">Attempt {entry.attemptNumber}</Badge>
                      <Badge tone={entry.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
                        {entry.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                      </Badge>
                      <Badge tone={DECISION_TONE[entry.status]}>
                        {entry.status.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {entry.reviewerId?.name} · {formatDateTime(entry.reviewedAt)}
                      </span>
                    </div>
                    {entry.comments ? (
                      <p className="mt-1.5 text-sm whitespace-pre-wrap">{entry.comments}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {isAdmin ? (
            <>
              {/* Both halves, each filed for the person it belongs to. */}
              <ReviewForm
                submissionId={submissionId}
                reviewerType="FACULTY"
                filedBy="admin"
                reviewerName={assigned.facultyName}
                alreadyReviewed={Boolean(facultyReview)}
                isCurrentAttempt={isCurrentAttempt}
                myStatus={record.facultyReviewStatus}
                otherStatus={record.mentorReviewStatus}
                existingComments={facultyReview?.comments ?? ''}
                recordedByName={facultyReview?.reviewerId?.name ?? null}
                reviewId={facultyReview?._id?.toString() ?? null}
              />

              <ReviewForm
                submissionId={submissionId}
                reviewerType="MENTOR"
                filedBy="admin"
                reviewerName={assigned.mentorName}
                alreadyReviewed={Boolean(mentorReview)}
                isCurrentAttempt={isCurrentAttempt}
                myStatus={record.mentorReviewStatus}
                otherStatus={record.facultyReviewStatus}
                existingComments={mentorReview?.comments ?? ''}
                recordedByName={mentorReview?.reviewerId?.name ?? null}
                reviewId={mentorReview?._id?.toString() ?? null}
              />
            </>
          ) : (
            <>
              <ReviewForm
                submissionId={submissionId}
                reviewerType={reviewerType ?? 'FACULTY'}
                alreadyReviewed={Boolean(myReview)}
                isCurrentAttempt={isCurrentAttempt}
                myStatus={myStatus}
                otherStatus={otherStatus}
                existingComments={myReview?.comments ?? ''}
              />

              <Card>
                <CardHeader title="The other reviewer" />
                <CardBody className="text-sm">
                  {otherReview ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={DECISION_TONE[otherReview.status]}>
                          {otherReview.status.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {otherReview.reviewerId?.name} · {formatDateTime(otherReview.reviewedAt)}
                        </span>
                      </div>
                      {otherReview.comments ? (
                        <p className="whitespace-pre-wrap">{otherReview.comments}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      The {reviewerType === 'FACULTY' ? 'mentor' : 'faculty'} has not reviewed this
                      attempt yet. Your approval alone will not complete the activity.
                    </p>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
