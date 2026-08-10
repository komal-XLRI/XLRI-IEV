import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard, StatTile } from '@/components/ui/Card';
import { CheckCircle2, GraduationCap, Play, RotateCcw, TrendingUp, UserCheck } from 'lucide-react';
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

export const metadata: Metadata = { title: 'My dashboard' };
export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  const user = await requireRole('STUDENT');
  const venture = await getVentureByStudentId(user.userId);

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
      </>
    );
  }

  await connectToDatabase();
  const [progress, faculty, mentor] = await Promise.all([
    getVentureProgress(venture._id.toString()),
    venture.facultyId ? User.findById(venture.facultyId).select('name email').lean().exec() : null,
    venture.mentorId ? User.findById(venture.mentorId).select('name email').lean().exec() : null,
  ]);

  const rows = toTimeline(progress);
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;
  const current = rows.find((r) => r.unlocked && r.status !== 'COMPLETED');
  const needsAttention = rows.filter((r) => r.status === 'REVISION_REQUIRED').length;

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
          hint={current?.name ?? 'Every activity has both approvals'}
          icon={Play}
          tone={current ? 'neutral' : 'positive'}
        />
        <KpiCard
          label="Needs revision"
          value={needsAttention}
          hint={needsAttention > 0 ? 'A reviewer asked for changes' : 'Nothing sent back to you'}
          icon={needsAttention > 0 ? RotateCcw : CheckCircle2}
          tone={needsAttention > 0 ? 'warning' : 'positive'}
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
          Both a faculty and a mentor approval are required to complete an activity, so contact the
          programme office before submitting.
        </FormMessage>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title="Venture timeline"
          description="Each activity unlocks when the previous one is approved by both your faculty and your mentor."
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
