import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/AppShell';
import { UserDirectory, type DirectoryUser } from '@/components/admin/UserDirectory';
import { ImportPanel } from '@/components/import/ImportPanel';
import { ExportMenu } from '@/components/export/ExportMenu';
import { FilterBar } from '@/components/filters/FilterBar';
import { mentorImport } from '@/services/import/specs';
import { DIRECTORY_LIMIT, listUsers } from '@/services/users/userService';
import { parseReportFilters } from '@/validators/reportFilters';
import { USER_STATUSES } from '@/lib/constants/roles';
import { humanise } from '@/services/export/filterLabels';
import { MentorProfile } from '@/models';
import { connectToDatabase } from '@/lib/db/mongoose';

export const metadata: Metadata = { title: 'Mentors' };
export const dynamic = 'force-dynamic';

export default async function AdminMentorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseReportFilters(await searchParams);

  await connectToDatabase();
  const { items, total } = await listUsers({
    role: 'MENTOR',
    q: filters.q,
    status: filters.userStatus,
    page: 1,
    pageSize: DIRECTORY_LIMIT,
  });

  const profiles = await MentorProfile.find({ userId: { $in: items.map((u) => u._id) } })
    .select('userId company industry designation expertise bio')
    .lean()
    .exec();
  const byUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const users: DirectoryUser[] = items.map((user) => {
    const profile = byUser.get(user._id.toString());
    const detail = [profile?.company, profile?.industry].filter(Boolean).join(' · ');
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      detail: detail || undefined,
      profile: {
        company: profile?.company ?? '',
        designation: profile?.designation ?? '',
        industry: profile?.industry ?? '',
        expertise: profile?.expertise ?? '',
        bio: profile?.bio ?? '',
      },
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Mentors"
        title="Industry mentors"
        description="Each venture has exactly one assigned mentor whose approval is mandatory."
        action={
          <ImportPanel
            spec={mentorImport.key}
            title={mentorImport.title}
            description={mentorImport.description}
            columns={mentorImport.columns}
          />
        }
      />

      <FilterBar
        fields={[
          {
            name: 'q',
            label: 'Search',
            type: 'search',
            placeholder: 'Name, email, company or industry',
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
        <ExportMenu dataset="mentors" />
      </FilterBar>

      <UserDirectory role="MENTOR" users={users} detailLabel="Company / industry" total={total} />
    </>
  );
}
