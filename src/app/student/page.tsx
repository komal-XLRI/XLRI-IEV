import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard, StatTile } from '@/components/ui/Card';
import { GraduationCap, Play, Presentation, TrendingUp, UserCheck } from 'lucide-react';
import { FormMessage } from '@/components/ui/FormMessage';
import { ActivityTimeline, ProgressBar } from '@/components/venture/ActivityTimeline';
import {
  getVentureByStudentId,
  getVentureProgress,
} from '@/services/ventures/studentVentureService';
import { toTimeline } from '@/services/ventures/timeline';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User } from '@/models';
import { ExportMenu } from '@/components/export/ExportMenu';
import { NextWorkshop } from '@/components/student/NextWorkshop';
import { ReviewFeedback } from '@/components/student/ReviewFeedback';
import { listWorkshopsForStudent } from '@/services/workshops/workshopService';
import { getReviewFeedbackForStudent } from '@/services/reviews/reviewService';

export const metadata: Metadata = { title: 'My dashboard' };
export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  const user = await requireRole('STUDENT');
  const [venture, workshops] = await Promise.all([
    getVentureByStudentId(user.userId),
    listWorkshopsForStudent(),
  ]);

  // Cancelled sessions stay on the workshops page so nobody turns up to one,
  // but "next workshop" must point at something that is actually happening.
  const nextWorkshop = workshops.upcoming.find((workshop) => workshop.status !== 'CANCELLED');

  if (!venture) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name}`} />
        <Card>
          <EmptyState
            title="No venture assigned yet"
            description="Your programme office will create your venture record and assign your faculty and mentor. Check back shortly."
          />
        </Card>

        {/* Workshops are open to the whole cohort, so they are worth showing
            even to a student whose venture record does not exist yet. */}
        <NextWorkshop workshop={nextWorkshop} />
      </>
    );
  }

  await connectToDatabase();
  const [progress, reviewFeedback, faculty, mentor] = await Promise.all([
    getVentureProgress(venture._id.toString()),
    getReviewFeedbackForStudent(venture._id.toString()),
    venture.facultyId ? User.findById(venture.facultyId).select('name email').lean().exec() : null,
    venture.mentorId ? User.findById(venture.mentorId).select('name email').lean().exec() : null,
  ]);

  const rows = toTimeline(progress);
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;
  const current = rows.find((r) => r.unlocked && r.status !== 'COMPLETED');
  const presented = rows.filter((r) => r.presentationReceivedAt !== null).length;

  return (
    <>
      <PageHeader
        eyebrow="My venture"
        title={venture.ventureName}
        description={venture.ventureTitle ?? 'Your venture across the three-term programme.'}
        action={<ExportMenu dataset="my-progress" label="Export progress" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Overall progress"
          value={`${rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100)}%`}
          hint={`${completed} of ${rows.length} activities complete`}
          icon={TrendingUp}
          tone="primary"
        />
        <KpiCard
          label="Current activity"
          value={current ? current.activityCode : 'All done'}
          hint={current?.name ?? 'Every stage is complete'}
          icon={Play}
          tone={current ? 'neutral' : 'positive'}
        />
        <KpiCard
          label="Presentations received"
          value={presented}
          hint={`of ${rows.length} stages`}
          icon={Presentation}
          tone="accent"
        />

        {/* Both reviewers on one tile: they are a pair, and an activity needs
            both of them, so splitting them into two tiles understated that. */}
        <StatTile
          label="Your reviewers"
          value={
            <span className="block">
              <span className="flex items-center gap-1.5 truncate">
                <GraduationCap
                  className="text-muted-foreground size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {faculty?.name ?? 'Faculty not assigned'}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate font-normal">
                <UserCheck className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                {mentor?.name ?? 'Mentor not assigned'}
              </span>
            </span>
          }
          tone={!faculty || !mentor ? 'warning' : 'neutral'}
        />
      </div>

      {!faculty || !mentor ? (
        <FormMessage tone="error" className="mt-4">
          <span className="font-medium">
            {!faculty && !mentor
              ? 'Neither reviewer has been assigned yet.'
              : !faculty
                ? 'Your faculty reviewer has not been assigned yet.'
                : 'Your industry mentor has not been assigned yet.'}
          </span>{' '}
          Contact the programme office so both can be assigned.
        </FormMessage>
      ) : null}

      <div className="mt-5">
        <ReviewFeedback reviews={reviewFeedback} />
      </div>

      <NextWorkshop workshop={nextWorkshop} />

      <Card className="mt-5">
        <CardHeader
          title="Venture timeline"
          description="Each stage unlocks once the previous one is complete — your presentation is in and feedback has been given."
          action={<ExportMenu dataset="my-submissions" label="Export submissions" />}
        />
        <CardBody>
          <ProgressBar completed={completed} total={rows.length} />
        </CardBody>
        <ActivityTimeline rows={rows} hrefFor={(row) => `/student/activities/${row.recordId}`} />
      </Card>
    </>
  );
}
