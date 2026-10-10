import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { getVentureActivity } from '@/services/ventures/ventureActivityService';
import { listStagePresentations, listStageStudents } from '@/services/ventures/presentationService';
import { listBehaviourForActivity } from '@/services/ventures/behaviourService';
import { BehaviourPanel } from '@/components/admin/BehaviourPanel';
import { getStageFeedback } from '@/services/ventures/mentorFeedbackService';
import { AutoRefresh } from '@/components/layout/AutoRefresh';
import { PresentationsPanel } from '@/components/admin/PresentationsPanel';
import { isValidObjectId } from '@/lib/utils/ids';

export const metadata: Metadata = { title: 'Venture activity' };
export const dynamic = 'force-dynamic';

export default async function VentureActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [activity, students, presentations, behaviour, feedback] = await Promise.all([
    getVentureActivity(id),
    listStageStudents(id),
    listStagePresentations(id),
    listBehaviourForActivity(id),
    getStageFeedback(id),
  ]);

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description="Student presentations, mentor feedback and HR & behaviour feedback for this stage."
        action={
          <span className="flex flex-wrap items-center gap-3">
            {/* Attendance moved to its own register; this is the same activity,
                pre-filtered, so the old route into it still leads somewhere. */}
            <Link
              href={`/admin/attendance?ventureActivityId=${id}`}
              className="text-primary text-sm hover:underline"
            >
              Attendance register
            </Link>
            <Link href="/admin/venture-activities" className="text-primary text-sm hover:underline">
              Back to list
            </Link>
            <Link
              href={`/admin/venture-activities/${id}/edit`}
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit stage
            </Link>
          </span>
        }
      />

      <PresentationsPanel
        ventureActivityId={id}
        students={students}
        presentations={presentations}
        feedback={{
          forms: feedback.forms,
          // Each presentation shows its own mentor feedback, responses included.
          byParticipant: feedback.byParticipant,
          tally: feedback.tally,
        }}
      />

      {/* Mentor feedback arrives from Google, outside any request on this page. */}
      <AutoRefresh />

      <BehaviourPanel rows={behaviour} />
    </>
  );
}
