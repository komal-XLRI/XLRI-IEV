import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/AppShell';
import { UserDirectory, type DirectoryUser } from '@/components/admin/UserDirectory';
import { ImportPanel } from '@/components/import/ImportPanel';
import { ExportMenu } from '@/components/export/ExportMenu';
import { FilterBar } from '@/components/filters/FilterBar';
import { studentImport } from '@/services/import/specs';
import { getFilterOptions } from '@/services/export/filterOptions';
import { DIRECTORY_LIMIT, listUsers } from '@/services/users/userService';
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

  const [options, { items, total }] = await Promise.all([
    getFilterOptions(),
    listUsers({
      role: 'STUDENT',
      q: filters.q,
      status: filters.userStatus,
      batch: filters.batch,
      page: 1,
      pageSize: DIRECTORY_LIMIT,
    }),
  ]);

  const profiles = await StudentProfile.find({ userId: { $in: items.map((u) => u._id) } })
    .select('userId rollNumber batch cluster background strengths weakness personalContext')
    .lean()
    .exec();
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  // Every filter — including batch — was applied by the query above, so this
  // is a pure projection. Filtering here would only ever search the page.
  const users: DirectoryUser[] = items.map((user) => {
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
      // Carried so a row can be edited without fetching the profile again.
      profile: {
        rollNumber: profile?.rollNumber ?? '',
        batch: profile?.batch ?? '',
        cluster: profile?.cluster ?? '',
        background: profile?.background ?? '',
        strengths: profile?.strengths ?? '',
        weakness: profile?.weakness ?? '',
        personalContext: profile?.personalContext ?? '',
      },
    };
  });

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
          {
            name: 'q',
            label: 'Search',
            type: 'search',
            placeholder: 'Name, email or roll number',
          },
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

      <UserDirectory role="STUDENT" users={users} detailLabel="Roll / batch" total={total} />
    </>
  );
}
