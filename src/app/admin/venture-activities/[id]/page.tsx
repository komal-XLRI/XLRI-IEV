import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/AppShell';
import {
  getSupportActivitiesForVentureActivity,
  getVentureActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { listTerms } from '@/services/academic/academicService';
import { EditVentureActivity } from '@/components/admin/EditVentureActivity';
import { AttendanceRoster } from '@/components/admin/AttendanceRoster';
import { getAttendanceRoster } from '@/services/ventures/attendanceService';
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

  const [activity, terms, allSupports, mappedSupports, roster] = await Promise.all([
    getVentureActivity(id),
    listTerms(),
    listSupportActivities(),
    getSupportActivitiesForVentureActivity(id),
    getAttendanceRoster(id),
  ]);

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description="Dates, attempt limit and the support activities that feed this stage."
        action={
          <Link href="/admin/venture-activities" className="text-primary text-sm hover:underline">
            Back to list
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

      <div className="mt-5 scroll-mt-20" id="attendance">
        <AttendanceRoster
          ventureActivityId={id}
          activityLabel={`${activity.activityCode} · ${activity.name}`}
          rows={roster.rows.map((row) => ({
            recordId: row.recordId,
            studentName: row.studentName,
            studentEmail: row.studentEmail,
            ventureName: row.ventureName,
            attendanceStatus: row.attendanceStatus,
          }))}
          counts={roster.counts}
        />
      </div>
    </>
  );
}
