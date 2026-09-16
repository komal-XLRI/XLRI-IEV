import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { ClipboardList } from 'lucide-react';
import {
  getSupportActivitiesForVentureActivity,
  getVentureActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { listTerms } from '@/services/academic/academicService';
import { EditVentureActivity } from '@/components/admin/EditVentureActivity';
import { ActivitySubmissionsTable } from '@/components/admin/ActivitySubmissionsTable';
import { listSubmissionsForActivity } from '@/services/submissions/submissionService';
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

  const [activity, terms, allSupports, mappedSupports, submissions] = await Promise.all([
    getVentureActivity(id),
    listTerms(),
    listSupportActivities(),
    getSupportActivitiesForVentureActivity(id),
    listSubmissionsForActivity(id),
  ]);

  const awaiting = submissions.filter((row) => row.status === 'UNDER_REVIEW').length;

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description="Dates, attempt limit and the support activities that feed this stage."
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

      <Card className="mb-4">
        <CardHeader
          title="Student submissions"
          description={
            submissions.length === 0
              ? 'Nobody is on this activity yet.'
              : `${submissions.length} student(s) · ${awaiting} awaiting a verdict · open one to read the work, see the files and review it`
          }
          icon={ClipboardList}
        />

        <ActivitySubmissionsTable rows={submissions} />
      </Card>

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
          maxAttempts: activity.maxAttempts,
          evidenceRequired: activity.evidenceRequired,
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
