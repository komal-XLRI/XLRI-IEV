import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, Presentation, TrendingUp } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard } from '@/components/ui/Card';
import { ProgressBar } from '@/components/venture/ActivityTimeline';
import { StageStrip } from '@/components/student/StageJourney';
import {
  getVentureByStudentId,
  getVentureProgress,
} from '@/services/ventures/studentVentureService';
import { toTimeline } from '@/services/ventures/timeline';
import { getStudentMentorFeedback } from '@/services/ventures/mentorFeedbackService';
import { getBehaviourFeedbackForRecord } from '@/services/ventures/behaviourService';
import { getStudentAttendance } from '@/services/ventures/attendanceService';
import { ExportMenu } from '@/components/export/ExportMenu';
import { NextWorkshop } from '@/components/student/NextWorkshop';
import { AllStagesComplete, CurrentStageCard } from '@/components/student/CurrentStageCard';
import { listWorkshopsForStudent } from '@/services/workshops/workshopService';

export const metadata: Metadata = { title: 'My dashboard' };
export const dynamic = 'force-dynamic';

/**
 * The student's home. It leads with the stage they are on — their
 * presentation, the feedback on it and what to do next — then the wider
 * picture: progress, attendance, the next workshop and the full timeline.
 */
export default async function StudentDashboardPage() {
  const user = await requireRole('STUDENT');
  const firstName = user.name.split(' ')[0] ?? user.name;
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
        <PageHeader title={`Welcome, ${firstName}`} />
        <Card>
          <EmptyState
            title="No venture assigned yet"
            description="Your programme office will create your venture record. Check back shortly."
          />
        </Card>

        {/* Workshops are open to the whole cohort, so they are worth showing
            even to a student whose venture record does not exist yet. */}
        <NextWorkshop workshop={nextWorkshop} />
      </>
    );
  }

  const ventureId = venture._id.toString();
  const [progress, attendance] = await Promise.all([
    getVentureProgress(ventureId),
    getStudentAttendance(ventureId),
  ]);

  const rows = toTimeline(progress);
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;
  const presented = rows.filter((r) => r.presentationReceivedAt !== null).length;
  const current = rows.find((r) => r.unlocked && r.status !== 'COMPLETED');

  // Only the current stage's detail is loaded — the rest is on each stage page.
  const [mentorFeedback, behaviour] = current
    ? await Promise.all([
        getStudentMentorFeedback(current.recordId),
        getBehaviourFeedbackForRecord(current.recordId),
      ])
    : [null, null];

  const rate = attendance.totals.attendanceRate;

  return (
    <>
      <PageHeader
        eyebrow={`Welcome back, ${firstName}`}
        title={venture.ventureName}
        description={venture.ventureTitle || 'Your venture across the programme.'}
        action={<ExportMenu dataset="my-progress" label="Export progress" />}
      />

      {current && mentorFeedback ? (
        <CurrentStageCard
          data={{
            row: current,
            presentations: mentorFeedback.presentations,
            feedback: {
              counted: mentorFeedback.counted,
              required: mentorFeedback.required,
              complete: mentorFeedback.complete,
              formConfigured: mentorFeedback.formConfigured,
            },
            behaviour,
          }}
        />
      ) : (
        <AllStagesComplete total={rows.length} />
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Overall progress"
          value={`${rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100)}%`}
          hint={`${completed} of ${rows.length} stages complete`}
          icon={TrendingUp}
          tone="primary"
        />
        <KpiCard
          label="Presentations"
          value={presented}
          hint={`received, of ${rows.length} stages`}
          icon={Presentation}
          tone="accent"
        />
        <KpiCard
          label="Attendance"
          value={rate === null ? '—' : `${Math.round(rate)}%`}
          hint={
            attendance.totals.sessions === 0
              ? 'No sessions recorded yet'
              : `${attendance.totals.present} of ${attendance.totals.sessions} sessions`
          }
          icon={CalendarCheck}
          tone={rate !== null && rate < 75 ? 'warning' : 'positive'}
          href="/student/attendance"
        />
      </div>

      <NextWorkshop workshop={nextWorkshop} />

      <Card className="mt-5">
        <CardHeader
          title="Your journey"
          description="Each stage unlocks once the previous one is complete — your presentation is in and mentor feedback has been given."
          action={
            <Link
              href="/student/timeline"
              className="text-primary inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
            >
              Full timeline
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        <CardBody>
          <ProgressBar completed={completed} total={rows.length} />
        </CardBody>
        <StageStrip rows={rows} />
      </Card>
    </>
  );
}
