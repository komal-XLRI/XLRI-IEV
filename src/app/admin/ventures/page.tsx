import type { Metadata } from 'next';
import { AlertTriangle, Briefcase, CheckCircle2, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, KpiCard } from '@/components/ui/Card';
import { VentureTable, type VentureRow } from '@/components/admin/VentureTable';
import { CreateVentureForm } from '@/components/admin/CreateVentureForm';
import { FilterBar } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import { listVentures } from '@/services/ventures/studentVentureService';
import { listReviewersByRole, listStudentsWithoutVenture } from '@/services/users/userService';
import { getStudentProgressReport } from '@/services/reports/reportService';
import { getFilterOptions } from '@/services/export/filterOptions';
import { parseReportFilters } from '@/validators/reportFilters';
import { serialize } from '@/lib/utils/serialize';
import { VENTURE_STATUSES } from '@/lib/constants/status';
import { humanise } from '@/services/export/filterLabels';

export const metadata: Metadata = { title: 'Ventures' };
export const dynamic = 'force-dynamic';

export default async function AdminVenturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);

  const [ventures, students, faculty, mentors, progress, options] = await Promise.all([
    // Reviewer and status filters are applied by the query, not to the result:
    // matching a reviewer by the name shown in a row confuses two people who
    // share a name, and cannot express "assigned to nobody" at all.
    listVentures({
      status: filters.ventureStatus,
      facultyId: filters.facultyId,
      mentorId: filters.mentorId,
      termId: filters.termId,
      q: filters.q,
    }),
    listStudentsWithoutVenture(),
    listReviewersByRole('FACULTY'),
    listReviewersByRole('MENTOR'),
    // Keyed by studentVentureId, so progress joins onto the venture list
    // exactly rather than by matching names.
    getStudentProgressReport(),
    getFilterOptions(),
  ]);

  const progressById = new Map(progress.map((row) => [row.studentVentureId, row]));

  const rows: VentureRow[] = ventures.map((venture) => {
    const id = venture._id.toString();
    const stats = progressById.get(id);

    return {
      id,
      studentName: venture.studentId?.name ?? 'Unknown',
      studentEmail: venture.studentId?.email ?? '',
      ventureName: venture.ventureName,
      industry: venture.industry ?? null,
      targetMarket: venture.targetMarket ?? null,
      facultyName: venture.facultyId?.name ?? null,
      mentorName: venture.mentorId?.name ?? null,
      currentActivity: venture.currentVentureActivityId
        ? `${venture.currentVentureActivityId.activityCode} · ${venture.currentVentureActivityId.name}`
        : null,
      completed: stats?.completed ?? 0,
      total: stats?.total ?? 0,
      percentage: stats?.percentage ?? 0,
      status: venture.status,
    };
  });

  const unassigned = rows.filter((row) => !row.facultyName || !row.mentorName).length;
  const active = rows.filter((row) => row.status === 'ACTIVE').length;
  const averageProgress =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length);

  const people = {
    students: serialize(students).map((s) => ({ _id: s._id, name: s.name, email: s.email })),
    faculty: serialize(faculty).map((f) => ({ _id: f._id, name: f.name, email: f.email })),
    mentors: serialize(mentors).map((m) => ({ _id: m._id, name: m.name, email: m.email })),
  };

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Student ventures"
        description="One primary venture per student. Assigning a faculty member and a mentor here is what grants review rights."
        action={<CreateVentureForm {...people} />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ventures" value={rows.length} icon={Briefcase} tone="primary" />
        <KpiCard
          label="Active"
          value={active}
          hint="Currently running"
          icon={CheckCircle2}
          tone="positive"
        />
        <KpiCard
          label="Awaiting a reviewer"
          value={unassigned}
          hint={unassigned > 0 ? 'Cannot be reviewed until assigned' : 'All pairs complete'}
          icon={unassigned > 0 ? AlertTriangle : CheckCircle2}
          tone={unassigned > 0 ? 'warning' : 'positive'}
        />
        <KpiCard
          label="Average progress"
          value={`${averageProgress}%`}
          hint="Activities completed per venture"
          icon={TrendingUp}
          tone="accent"
        />
      </div>

      <FilterBar
        fields={[
          {
            name: 'q',
            label: 'Search',
            type: 'search',
            placeholder: 'Venture, student or industry',
          },
          {
            name: 'ventureStatus',
            label: 'Venture status',
            type: 'select',
            options: VENTURE_STATUSES.map((status) => ({
              value: status,
              label: humanise(status) ?? status,
            })),
          },
          { name: 'facultyId', label: 'Faculty', type: 'select', options: options.faculty },
          { name: 'mentorId', label: 'Mentor', type: 'select', options: options.mentors },
          { name: 'termId', label: 'Term', type: 'select', options: options.terms },
        ]}
      >
        <ExportMenu dataset="ventures" />
      </FilterBar>

      <Card>
        <VentureTable ventures={rows} />
      </Card>
    </>
  );
}
