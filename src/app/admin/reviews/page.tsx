import type { Metadata } from 'next';
import { CheckCircle2, CircleSlash, Clock, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, KpiCard } from '@/components/ui/Card';
import { NavLink } from '@/components/layout/NavLink';
import { ExportMenu } from '@/components/export/ExportMenu';
import {
  PendingReviewTable,
  ReviewHistoryTable,
  type HistoryRow,
} from '@/components/admin/ReviewTables';
import { getAllReviews } from '@/services/reviews/reviewService';
import {
  getPendingReviewAttempts,
  getReviewQueueSummary,
} from '@/services/dashboard/dashboardService';
import { REVIEW_DECISIONS, REVIEWER_TYPES, type ReviewerType } from '@/lib/constants/status';

export const metadata: Metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

const PENDING_LIMIT = 200;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reviewerType?: string }>;
}) {
  const { status, reviewerType } = await searchParams;

  const decision = REVIEW_DECISIONS.find((d) => d === status);
  const type = REVIEWER_TYPES.find((t) => t === reviewerType) as ReviewerType | undefined;

  const [reviews, reviewerLoad, pending] = await Promise.all([
    getAllReviews({ status: decision, reviewerType: type, limit: 200 }),
    getReviewQueueSummary(),
    getPendingReviewAttempts(PENDING_LIMIT),
  ]);

  const totalPending = reviewerLoad.reduce((sum, row) => sum + row.pending, 0);
  const awaitingFaculty = pending.filter((row) => row.facultyReviewStatus === 'PENDING').length;
  const awaitingMentor = pending.filter((row) => row.mentorReviewStatus === 'PENDING').length;

  const history: HistoryRow[] = reviews.map((review) => ({
    id: review._id.toString(),
    reviewedAt: review.reviewedAt.toISOString(),
    reviewerName: review.reviewerId?.name ?? 'Unknown',
    reviewerType: review.reviewerType,
    status: review.status as HistoryRow['status'],
    comments: review.comments ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Reviews &amp; reporting"
        title="Reviews"
        description="An activity completes only when both the faculty member and the mentor approve the same attempt."
        action={<ExportMenu dataset="review-log" />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Verdicts outstanding"
          value={totalPending}
          hint={`${awaitingFaculty} faculty · ${awaitingMentor} mentor`}
          icon={Clock}
          tone={totalPending > 0 ? 'warning' : 'positive'}
        />
        <KpiCard
          label="Approved"
          value={reviews.filter((r) => r.status === 'APPROVED').length}
          hint="In the current filter"
          icon={CheckCircle2}
          tone="positive"
        />
        <KpiCard
          label="Revision requested"
          value={reviews.filter((r) => r.status === 'REVISION_REQUIRED').length}
          hint="Sent back to the student"
          icon={RotateCcw}
          tone="warning"
        />
        <KpiCard
          label="Rejected"
          value={reviews.filter((r) => r.status === 'REJECTED').length}
          hint="In the current filter"
          icon={CircleSlash}
          tone="danger"
        />
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Awaiting a verdict"
          description="Attempts sitting under review right now, oldest first."
          icon={Clock}
        />
        <PendingReviewTable rows={pending} />
      </Card>

      <Card>
        <CardHeader
          title="Review history"
          description={`${reviews.length} recorded verdict(s) — never edited or deleted`}
          icon={CheckCircle2}
          action={
            <nav className="flex flex-wrap gap-1" aria-label="Filter review history">
              <NavLink href="/admin/reviews" exact>
                All
              </NavLink>
              <NavLink href="/admin/reviews?status=APPROVED">Approved</NavLink>
              <NavLink href="/admin/reviews?status=REVISION_REQUIRED">Revision</NavLink>
              <NavLink href="/admin/reviews?status=REJECTED">Rejected</NavLink>
              <NavLink href="/admin/reviews?reviewerType=FACULTY">Faculty</NavLink>
              <NavLink href="/admin/reviews?reviewerType=MENTOR">Mentor</NavLink>
            </nav>
          }
        />
        <ReviewHistoryTable rows={history} />
      </Card>
    </>
  );
}
