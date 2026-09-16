import { GraduationCap, HeartHandshake, MessageSquareQuote } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils/dates';
import type { StudentReviewFeedback } from '@/services/reviews/reviewService';

const DECISION_TONE = {
  APPROVED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
} as const;

/**
 * What the student's reviewers have written, gathered from every activity.
 *
 * The same comments sit on each activity's own page, but only for whoever
 * thinks to open it. A student who has been asked for a revision needs to find
 * that out without touring twelve activities, which is what this is for.
 *
 * Renders nothing at all when there is none — an empty "no feedback yet" card
 * on a dashboard is a permanent reminder of an absence nobody chose.
 */
export function ReviewFeedback({ reviews }: { reviews: StudentReviewFeedback[] }) {
  if (reviews.length === 0) return null;

  return (
    <Card className="mb-5">
      <CardHeader
        title="Reviewer feedback"
        description="From your faculty and your mentor, newest first."
        icon={MessageSquareQuote}
      />

      <CardBody className="space-y-2.5">
        {reviews.map((review) => {
          const Icon = review.reviewerType === 'FACULTY' ? GraduationCap : HeartHandshake;

          return (
            <article key={review._id} className="surface-sunken rounded-control border px-3.5 py-3">
              <header className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-3" aria-hidden="true" />
                </span>

                <span className="text-[13.5px] font-semibold">{review.reviewerName}</span>

                <Badge tone={review.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
                  {review.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                </Badge>

                <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                  {review.activityCode}
                </span>

                <Badge
                  tone={DECISION_TONE[review.status as keyof typeof DECISION_TONE] ?? 'neutral'}
                >
                  {review.status.replace(/_/g, ' ').toLowerCase()}
                </Badge>

                <span className="type-caption">Attempt {review.attemptNumber}</span>

                <span className="type-caption ml-auto whitespace-nowrap">
                  {formatDate(review.reviewedAt)}
                </span>
              </header>

              <p className="type-body whitespace-pre-line">{review.comments}</p>
            </article>
          );
        })}
      </CardBody>
    </Card>
  );
}
