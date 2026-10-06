import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, EmptyState } from '@/components/ui/Card';
import { ProgressBar } from '@/components/venture/ActivityTimeline';
import { StageJourneyList } from '@/components/student/StageJourney';
import {
  getVentureByStudentId,
  getVentureProgress,
} from '@/services/ventures/studentVentureService';
import { toTimeline } from '@/services/ventures/timeline';
import { getStageJourneys } from '@/services/ventures/mentorFeedbackService';

export const metadata: Metadata = { title: 'My timeline' };
export const dynamic = 'force-dynamic';

/** Every stage of the student's programme, in order, as one path. */
export default async function StudentTimelinePage() {
  const user = await requireRole('STUDENT');
  const venture = await getVentureByStudentId(user.userId);

  if (!venture) {
    return (
      <>
        <PageHeader title="My timeline" />
        <Card>
          <EmptyState
            title="No venture assigned yet"
            description="Your stages will appear here once your programme office creates your venture record."
          />
        </Card>
      </>
    );
  }

  // The venture is looked up from the signed-in student, so the journeys read
  // below can only ever be theirs.
  const ventureId = venture._id.toString();
  const [progress, journeys] = await Promise.all([
    getVentureProgress(ventureId),
    getStageJourneys(ventureId),
  ]);
  const rows = toTimeline(progress);
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;

  return (
    <>
      <PageHeader
        eyebrow={venture.ventureName}
        title="My timeline"
        description="Every stage of your programme, in order. Each one needs your presentation and mentor feedback on it — then the next stage unlocks."
      />

      <Card className="mb-5">
        <CardBody>
          <ProgressBar completed={completed} total={rows.length} />
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No stages yet"
            description="Your programme office has not set up the stages yet."
          />
        </Card>
      ) : (
        <StageJourneyList rows={rows} journeys={journeys} />
      )}
    </>
  );
}
