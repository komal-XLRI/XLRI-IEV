import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { getUserWithProfile } from '@/services/users/userService';
import { getVentureByStudentId } from '@/services/ventures/studentVentureService';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User } from '@/models';
import type { IStudentProfile } from '@/models';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function StudentProfilePage() {
  const session = await requireRole('STUDENT');
  const { user, profile } = await getUserWithProfile(session.userId);
  const studentProfile = profile as IStudentProfile | null;

  const venture = await getVentureByStudentId(session.userId);

  await connectToDatabase();
  const [faculty, mentor] = await Promise.all([
    venture?.facultyId ? User.findById(venture.facultyId).select('name email').lean().exec() : null,
    venture?.mentorId ? User.findById(venture.mentorId).select('name email').lean().exec() : null,
  ]);

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your details are maintained by the programme office. Contact them if anything is wrong."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <CardBody className="space-y-3 text-sm">
            <Row label="Name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={user.phone} />
            <Row label="Roll number" value={studentProfile?.rollNumber} />
            <Row label="Batch" value={studentProfile?.batch} />
            <Row label="Cluster" value={studentProfile?.cluster} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Your reviewers"
            description="Both approvals are required to complete an activity."
          />
          <CardBody className="space-y-3 text-sm">
            <Row
              label="Faculty"
              value={faculty ? `${faculty.name} · ${faculty.email}` : undefined}
            />
            <Row label="Mentor" value={mentor ? `${mentor.name} · ${mentor.email}` : undefined} />
            <Row label="Venture" value={venture?.ventureName} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Context" description="Shared with your faculty and mentor." />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Row label="Background" value={studentProfile?.background} multiline />
            <Row label="Strengths" value={studentProfile?.strengths} multiline />
            <Row label="Areas to develop" value={studentProfile?.weakness} multiline />
            <Row label="Personal context" value={studentProfile?.personalContext} multiline />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className={multiline ? 'mt-0.5 whitespace-pre-wrap' : 'mt-0.5'}>{value || '—'}</p>
    </div>
  );
}
