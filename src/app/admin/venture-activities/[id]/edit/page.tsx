import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import {
  getSupportActivitiesForVentureActivity,
  getVentureActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { listTerms } from '@/services/academic/academicService';
import { EditVentureActivity } from '@/components/admin/EditVentureActivity';
import { serialize } from '@/lib/utils/serialize';
import { isValidObjectId } from '@/lib/utils/ids';

export const metadata: Metadata = { title: 'Edit venture activity' };
export const dynamic = 'force-dynamic';

/** The stage's own settings — code, name, dates, term, status, support mapping. */
export default async function EditVentureActivitySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [activity, terms, allSupports, mappedSupports] = await Promise.all([
    getVentureActivity(id),
    listTerms(),
    listSupportActivities(),
    getSupportActivitiesForVentureActivity(id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={`Edit ${activity.activityCode}`}
        title={activity.name}
        description="Change this stage's code, name, description, dates, term, order or status, and which support activities feed it. Students see the changes straight away."
        action={
          <Link
            href={`/admin/venture-activities/${id}`}
            className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to stage
          </Link>
        }
      />

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
