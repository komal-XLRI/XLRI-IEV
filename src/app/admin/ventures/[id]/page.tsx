import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ActivityTimeline, ProgressBar } from '@/components/venture/ActivityTimeline';
import { getVentureDetail, getVentureProgress } from '@/services/ventures/studentVentureService';
import { toTimeline } from '@/services/ventures/timeline';
import { listReviewersByRole } from '@/services/users/userService';
import { AssignReviewersForm } from '@/components/admin/AssignReviewersForm';
import { getStudentSupportActivities } from '@/services/support/supportService';
import { serialize } from '@/lib/utils/serialize';
import { isValidObjectId } from '@/lib/utils/ids';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/export/ExportMenu';

export const metadata: Metadata = { title: 'Venture' };
export const dynamic = 'force-dynamic';

export default async function AdminVentureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [venture, progress, faculty, mentors, support] = await Promise.all([
    getVentureDetail(id),
    getVentureProgress(id),
    listReviewersByRole('FACULTY'),
    listReviewersByRole('MENTOR'),
    getStudentSupportActivities(id),
  ]);

  const rows = toTimeline(progress);
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;

  return (
    <>
      <PageHeader
        title={venture.ventureName}
        description={`${venture.studentId?.name ?? 'Unknown student'} · ${venture.studentId?.email ?? ''}`}
        action={
          <Link href="/admin/ventures" className="text-primary text-sm hover:underline">
            Back to ventures
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Progress"
              description="Sequential — each activity unlocks the next."
            />
            <CardBody>
              <ProgressBar completed={completed} total={rows.length} />
            </CardBody>
            <ActivityTimeline rows={rows} />
          </Card>

          <Card>
            <CardHeader
              title="Support activities"
              description="Participation records — no attempt limit or dual review applies here."
              action={
                <ExportMenu
                  dataset="support-participation"
                  extraParams={{ studentVentureId: id }}
                />
              }
            />
            <CardBody>
              <ul className="grid gap-2 sm:grid-cols-2">
                {support.map(({ record, support: activity }) => (
                  <li
                    key={record._id.toString()}
                    className="surface-sunken flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm">
                      <span className="font-mono text-xs">{activity.activityCode}</span>{' '}
                      {activity.name}
                    </span>
                    <Badge tone={record.status === 'COMPLETED' ? 'success' : 'neutral'}>
                      {record.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <AssignReviewersForm
            studentVentureId={id}
            currentFacultyId={venture.facultyId?._id?.toString() ?? ''}
            currentMentorId={venture.mentorId?._id?.toString() ?? ''}
            faculty={serialize(faculty).map((f) => ({ _id: f._id, name: f.name, email: f.email }))}
            mentors={serialize(mentors).map((m) => ({ _id: m._id, name: m.name, email: m.email }))}
          />

          <Card>
            <CardHeader title="Venture details" />
            <CardBody className="space-y-3 text-sm">
              <Detail label="Industry" value={venture.industry} />
              <Detail label="Target market" value={venture.targetMarket} />
              <Detail label="Problem" value={venture.problemStatement} />
              <Detail label="Solution" value={venture.solution} />
              <Detail label="Funding status" value={venture.fundingStatus} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value || '—'}</p>
    </div>
  );
}
