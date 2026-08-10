import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { getVentureByStudentId } from '@/services/ventures/studentVentureService';
import { getStudentSupportActivities } from '@/services/support/supportService';
import { getVentureActivitiesForSupportActivity } from '@/services/ventures/ventureActivityService';
import { SupportActivityRow } from '@/components/student/SupportActivityRow';

export const metadata: Metadata = { title: 'Support activities' };
export const dynamic = 'force-dynamic';

export default async function StudentSupportPage() {
  const user = await requireRole('STUDENT');
  const venture = await getVentureByStudentId(user.userId);

  if (!venture) {
    return (
      <>
        <PageHeader title="Support activities" />
        <Card>
          <EmptyState title="No venture assigned yet" />
        </Card>
      </>
    );
  }

  const records = await getStudentSupportActivities(venture._id.toString());

  const withMappings = await Promise.all(
    records.map(async ({ record, support }) => ({
      recordId: record._id.toString(),
      status: record.status,
      notes: record.notes ?? '',
      activityCode: support.activityCode,
      name: support.name,
      description: support.description ?? '',
      scheduleType: support.scheduleType,
      feeds: (await getVentureActivitiesForSupportActivity(support._id.toString())).map(
        (v) => v.activityCode,
      ),
    })),
  );

  return (
    <>
      <PageHeader
        title="Support activities"
        description="The eight activities that feed your venture work. Log your participation here; your reviewers confirm completion."
      />

      <Card>
        <CardHeader
          title="Your support activities"
          description="These are participation records — they carry no attempt limit and no dual-review requirement."
        />
        <ul className="divide-y">
          {withMappings.map((row) => (
            <SupportActivityRow key={row.recordId} row={row} />
          ))}
        </ul>
      </Card>
    </>
  );
}
