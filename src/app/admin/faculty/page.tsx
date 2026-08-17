import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/AppShell';
import { UserDirectory, type DirectoryUser } from '@/components/admin/UserDirectory';
import { ImportPanel } from '@/components/import/ImportPanel';
import { ExportMenu } from '@/components/export/ExportMenu';
import { FilterBar } from '@/components/filters/FilterBar';
import { facultyImport } from '@/services/import/specs';
import { DIRECTORY_LIMIT, listUsers } from '@/services/users/userService';
import { parseReportFilters } from '@/validators/reportFilters';
import { USER_STATUSES } from '@/lib/constants/roles';
import { humanise } from '@/services/export/filterLabels';
import { FacultyProfile } from '@/models';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Card, CardBody } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Faculty' };
export const dynamic = 'force-dynamic';

export default async function AdminFacultyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseReportFilters(await searchParams);

  await connectToDatabase();
  const { items, total } = await listUsers({
    role: 'FACULTY',
    q: filters.q,
    status: filters.userStatus,
    page: 1,
    pageSize: DIRECTORY_LIMIT,
  });

  const profiles = await FacultyProfile.find({ userId: { $in: items.map((u) => u._id) } })
    .select('userId designation department')
    .lean()
    .exec();
  const byUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const users: DirectoryUser[] = items.map((user) => {
    const profile = byUser.get(user._id.toString());
    const detail = [profile?.designation, profile?.department].filter(Boolean).join(' · ');
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      detail: detail || undefined,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title="Faculty"
        description="Academic staff. Venture review rights come from the venture assignment, not from teaching a subject."
        action={
          <ImportPanel
            spec={facultyImport.key}
            title={facultyImport.title}
            description={facultyImport.description}
            columns={facultyImport.columns}
          />
        }
      />

      <FilterBar
        fields={[
          {
            name: 'q',
            label: 'Search',
            type: 'search',
            placeholder: 'Name, email, designation or department',
          },
          {
            name: 'userStatus',
            label: 'Status',
            type: 'select',
            options: USER_STATUSES.map((status) => ({
              value: status,
              label: humanise(status) ?? status,
            })),
          },
        ]}
      >
        <ExportMenu dataset="faculty" />
      </FilterBar>

      <Card className="mb-4">
        <CardBody className="text-muted-foreground text-sm">
          Teaching a subject does not make someone a Venture Activity reviewer. Venture review
          rights come only from the faculty assigned on a student&rsquo;s venture, set under{' '}
          <span className="font-medium">Ventures</span>.
        </CardBody>
      </Card>

      <UserDirectory
        role="FACULTY"
        users={users}
        detailLabel="Designation / department"
        total={total}
      />
    </>
  );
}
