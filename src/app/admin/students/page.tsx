import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/AppShell';
import { UserDirectory, type DirectoryUser } from '@/components/admin/UserDirectory';
import { ImportPanel } from '@/components/import/ImportPanel';
import { ExportMenu } from '@/components/export/ExportMenu';
import { FilterBar } from '@/components/filters/FilterBar';
import { studentImport } from '@/services/import/specs';
import { getFilterOptions } from '@/services/export/filterOptions';
import { listUsers } from '@/services/users/userService';
import { parseReportFilters } from '@/validators/reportFilters';
import { USER_STATUSES } from '@/lib/constants/roles';
import { humanise } from '@/services/export/filterLabels';
import { StudentProfile } from '@/models';
import { connectToDatabase } from '@/lib/db/mongoose';

export const metadata: Metadata = { title: 'Students' };
export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);

  await connectToDatabase();

  const [options, { items }] = await Promise.all([
    getFilterOptions(),
    listUsers({
      role: 'STUDENT',
      q: filters.q,
      status: filters.userStatus,
      page: 1,
      pageSize: 200,
    }),
  ]);

  const profiles = await StudentProfile.find({ userId: { $in: items.map((u) => u._id) } })
    .select('userId rollNumber batch cluster')
    .lean()
    .exec();
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const users: DirectoryUser[] = items
    .map((user) => {
      const profile = profileByUser.get(user._id.toString());
      return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        batch: profile?.batch,
        detail: profile ? `${profile.rollNumber} · ${profile.batch}` : undefined,
      };
    })
    // Batch lives on the profile, so it is applied after the join.
    .filter((user) => !filters.batch || user.batch === filters.batch);

  return (
    <>
      <PageHeader
        eyebrow="Students"
        title="Student directory"
        description="Accounts, roll numbers and batches for everyone on the programme."
        action={
          <ImportPanel
            spec={studentImport.key}
            title={studentImport.title}
            description={studentImport.description}
            columns={studentImport.columns}
          />
        }
      />

      <FilterBar
        fields={[
          { name: 'q', label: 'Search', type: 'search', placeholder: 'Name or email' },
          { name: 'batch', label: 'Batch', type: 'select', options: options.batches },
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
        <ExportMenu dataset="students" />
      </FilterBar>

      <UserDirectory role="STUDENT" users={users} detailLabel="Roll / batch" />
    </>
  );
}
