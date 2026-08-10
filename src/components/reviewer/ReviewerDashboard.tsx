import { PageHeader } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/ui/Card';
import { Briefcase, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { ReviewQueue } from './ReviewQueue';
import { getReviewQueueRows } from '@/services/reviews/reviewQueueView';
import { listVentures } from '@/services/ventures/studentVentureService';
import type { Role } from '@/lib/constants/roles';
import { ExportMenu } from '@/components/export/ExportMenu';

/**
 * Faculty and Mentor dashboards are the same screen with a different
 * `reviewerType`. The queue itself is filtered server-side by assignment, so
 * a reviewer only ever sees ventures they own.
 */
export async function ReviewerDashboard({
  reviewer,
  basePath,
}: {
  reviewer: { userId: string; role: Extract<Role, 'FACULTY' | 'MENTOR'> };
  basePath: string;
}) {
  const isFaculty = reviewer.role === 'FACULTY';

  const [pending, all, ventures] = await Promise.all([
    getReviewQueueRows(reviewer, { state: 'PENDING' }),
    getReviewQueueRows(reviewer, { state: 'ALL' }),
    listVentures(isFaculty ? { facultyId: reviewer.userId } : { mentorId: reviewer.userId }),
  ]);

  const approved = all.filter((row) => row.myReviewStatus === 'APPROVED').length;
  const revisions = all.filter((row) => row.myReviewStatus === 'REVISION_REQUIRED').length;

  return (
    <>
      <PageHeader
        eyebrow={isFaculty ? 'Faculty' : 'Mentor'}
        title={isFaculty ? 'Faculty review desk' : 'Mentor review desk'}
        description={`Submissions from the ${ventures.length} venture(s) assigned to you. Your approval is one of the two required to complete an activity.`}
        action={<ExportMenu dataset="my-review-queue" label="Export queue" />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Assigned ventures"
          value={ventures.length}
          hint="You review every activity on these"
          icon={Briefcase}
          tone="primary"
        />
        <KpiCard
          label="Awaiting your verdict"
          value={pending.length}
          hint={pending.length > 0 ? 'Blocking completion' : 'Nothing waiting on you'}
          icon={pending.length > 0 ? Clock : CheckCircle2}
          tone={pending.length > 0 ? 'warning' : 'positive'}
        />
        <KpiCard
          label="You approved"
          value={approved}
          hint="Your half of the dual review"
          icon={CheckCircle2}
          tone="positive"
        />
        <KpiCard
          label="You sent back"
          value={revisions}
          hint="Revisions you requested"
          icon={RotateCcw}
        />
      </div>

      <div className="space-y-5">
        <ReviewQueue
          rows={pending}
          basePath={basePath}
          title="Awaiting your verdict"
          description="These attempts are under review and you have not recorded a decision yet."
          otherLabel={isFaculty ? 'Mentor verdict' : 'Faculty verdict'}
          emptyTitle="Nothing waiting on you"
          emptyDescription="Every submission from your assigned ventures has your verdict recorded."
        />

        <ReviewQueue
          rows={all.filter((row) => row.myReviewStatus !== 'PENDING')}
          basePath={basePath}
          title="Your review history"
          description="Verdicts you have already recorded. Reviews are never edited — a changed outcome comes from a new attempt."
          otherLabel={isFaculty ? 'Mentor verdict' : 'Faculty verdict'}
          emptyTitle="No reviews recorded yet"
          emptyDescription="Your completed reviews will appear here."
        />
      </div>
    </>
  );
}
