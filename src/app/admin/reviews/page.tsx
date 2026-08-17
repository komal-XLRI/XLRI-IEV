import type { Metadata } from 'next';
import { CheckCircle2, CircleSlash, Clock, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, KpiCard } from '@/components/ui/Card';
import { FilterBar } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { parseReportFilters } from '@/validators/reportFilters';
import { humanise } from '@/services/export/filterLabels';
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
import { REVIEW_DECISIONS, REVIEWER_TYPES } from '@/lib/constants/status';

export const metadata: Metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

const PENDING_LIMIT = 200;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The shared filter vocabulary, so review status and reviewer type compose
  // instead of each link replacing the whole query string.
  const filters = parseReportFilters(await searchParams);

  const [reviews, reviewerLoad, pending] = await Promise.all([
    getAllReviews({
      status: filters.reviewStatus,
      reviewerType: filters.reviewerType,
      limit: 200,
    }),
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
      />

      <FilterBar
        fields={[
          {
            name: 'reviewStatus',
            label: 'Decision',
            type: 'select',
            options: REVIEW_DECISIONS.map((decision) => ({
              value: decision,
              label: humanise(decision) ?? decision,
            })),
          },
          {
            name: 'reviewerType',
            label: 'Reviewer',
            type: 'select',
            options: REVIEWER_TYPES.map((type) => ({
              value: type,
              label: humanise(type) ?? type,
            })),
          },
        ]}
      >
        <ExportMenu dataset="review-log" />
      </FilterBar>

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
        />
        <ReviewHistoryTable rows={history} />
      </Card>
    </>
  );
}
