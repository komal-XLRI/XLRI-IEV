import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/AppShell';
import {
  getSupportActivitiesForVentureActivity,
  getVentureActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { listPresentationsForActivity } from '@/services/ventures/presentationService';
import { listBehaviourForActivity } from '@/services/ventures/behaviourService';
import { BehaviourPanel } from '@/components/admin/BehaviourPanel';
import { listTerms } from '@/services/academic/academicService';
import { EditVentureActivity } from '@/components/admin/EditVentureActivity';
import { PresentationsPanel } from '@/components/admin/PresentationsPanel';
import { serialize } from '@/lib/utils/serialize';
import { isValidObjectId } from '@/lib/utils/ids';

export const metadata: Metadata = { title: 'Edit venture activity' };
export const dynamic = 'force-dynamic';

export default async function EditVentureActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [activity, terms, allSupports, mappedSupports, presentations, behaviour] =
    await Promise.all([
      getVentureActivity(id),
      listTerms(),
      listSupportActivities(),
      getSupportActivitiesForVentureActivity(id),
      listPresentationsForActivity(id),
      listBehaviourForActivity(id),
    ]);

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description="Student presentations, HR & behaviour feedback, dates and the support activities that feed this stage."
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
          </span>
        }
      />

      <PresentationsPanel
        ventureActivityId={id}
        folderUrl={activity.presentationFolderUrl ?? null}
        rows={presentations}
      />

      <BehaviourPanel rows={behaviour} />

      <EditVentureActivity
        activity={serialize({
          _id: activity._id,
          activityCode: activity.activityCode,
          name: activity.name,
          description: activity.description ?? '',
          termId: activity.termId._id,
          order: activity.order,
          startDate: activity.startDate,
          endDate: activity.endDate,
          durationDays: activity.durationDays,
          status: activity.status,
        })}
        terms={serialize(terms).map((t) => ({
          _id: t._id,
          name: t.name,
          termNumber: t.termNumber,
        }))}
        supportActivities={serialize(allSupports).map((s) => ({
          _id: s._id,
          activityCode: s.activityCode,
          name: s.name,
        }))}
        mappedSupportIds={mappedSupports.map((s) => s._id.toString())}
      />
    </>
  );
}
