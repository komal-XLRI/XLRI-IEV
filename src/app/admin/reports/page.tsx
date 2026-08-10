import type { Metadata } from 'next';
import {
  Activity,
  ClipboardCheck,
  FileBarChart,
  Layers,
  RefreshCw,
  ScrollText,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, Section } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { MeterBar, StackedBar, type Segment } from '@/components/ui/Chart';
import { Badge } from '@/components/ui/Badge';
import { FilterBar } from '@/components/filters/FilterBar';
import { ExportMenu } from '@/components/export/ExportMenu';
import {
  getActivityCompletionReport,
  getAttemptsReport,
  getReviewSummaryReport,
  getStudentProgressReport,
} from '@/services/reports/reportService';
import { getFilterOptions } from '@/services/export/filterOptions';
import { parseReportFilters } from '@/validators/reportFilters';
import { STUDENT_ACTIVITY_STATUSES } from '@/lib/constants/status';
import { humanise } from '@/services/export/filterLabels';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const ATTEMPT_PREVIEW = 100;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);

  const [options, progress, completion, reviewSummary, attempts] = await Promise.all([
    getFilterOptions(),
    getStudentProgressReport(filters),
    getActivityCompletionReport(filters),
    getReviewSummaryReport(filters),
    getAttemptsReport(filters),
  ]);

  /**
   * The catalogue. Every entry exports in all four formats and carries whatever
   * filters are set above — the export endpoint parses the same query string
   * this page did, so a download always matches what is on screen.
   */
  const catalogue = [
    {
      dataset: 'student-progress',
      title: 'Student progress',
      description: 'Completion per student. Counts only activities approved by both reviewers.',
      icon: Users,
      rows: progress.length,
      unit: 'student',
    },
    {
      dataset: 'venture-progress',
      title: 'Venture report',
      description: 'The same cohort by venture — industry, target market, funding and progress.',
      icon: TrendingUp,
      rows: progress.length,
      unit: 'venture',
    },
    {
      dataset: 'activity-completion',
      title: 'Activity completion',
      description: 'How the cohort is distributed across each Venture Activity.',
      icon: Activity,
      rows: completion.length,
      unit: 'activity',
    },
    {
      dataset: 'review-summary',
      title: 'Faculty & mentor review summary',
      description: 'Verdicts recorded per reviewer, plus what each still owes.',
      icon: ClipboardCheck,
      rows: reviewSummary.length,
      unit: 'reviewer',
    },
    {
      dataset: 'attempts',
      title: 'Submission & attempt report',
      description: 'Attempts used against each activity’s configured maximum.',
      icon: RefreshCw,
      rows: attempts.length,
      unit: 'record',
    },
    {
      dataset: 'review-log',
      title: 'Review log',
      description: 'Every recorded verdict, in order. Never edited or deleted.',
      icon: ScrollText,
      rows: null,
      unit: 'verdict',
    },
    {
      dataset: 'support-participation',
      title: 'Support activity participation',
      description: 'Who has completed which of the support activities.',
      icon: Layers,
      rows: null,
      unit: 'record',
    },
  ] as const;

  const progressColumns: DataColumn[] = [
    { key: 'student', header: 'Student' },
    { key: 'venture', header: 'Venture', hideBelow: 'md' },
    { key: 'faculty', header: 'Faculty', hideBelow: 'lg', toggleable: true },
    { key: 'mentor', header: 'Mentor', hideBelow: 'lg', toggleable: true },
    { key: 'current', header: 'Current activity', hideBelow: 'xl' },
    { key: 'review', header: 'Under review', align: 'right', hideBelow: 'sm', toggleable: true },
    { key: 'revision', header: 'Revision', align: 'right', hideBelow: 'sm', toggleable: true },
    { key: 'progress', header: 'Progress' },
  ];

  const completionColumns: DataColumn[] = [
    { key: 'activity', header: 'Activity' },
    { key: 'term', header: 'Term', hideBelow: 'md' },
    { key: 'spread', header: 'Distribution', sortable: false },
    { key: 'completed', header: 'Completed', align: 'right' },
    { key: 'rate', header: 'Rate', align: 'right' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Reviews &amp; reporting"
        title="Reports"
        description="Set the filters once — every export below carries the same filters, search, date range and sort order."
      />

      <FilterBar
        fields={[
          { name: 'q', label: 'Search', type: 'search', placeholder: 'Student or venture' },
          { name: 'termId', label: 'Term', type: 'select', options: options.terms },
          {
            name: 'ventureActivityId',
            label: 'Venture Activity',
            type: 'select',
            options: options.ventureActivities,
          },
          { name: 'studentId', label: 'Student', type: 'select', options: options.students },
          { name: 'facultyId', label: 'Faculty', type: 'select', options: options.faculty },
          { name: 'mentorId', label: 'Mentor', type: 'select', options: options.mentors },
          {
            name: 'activityStatus',
            label: 'Status',
            type: 'select',
            options: STUDENT_ACTIVITY_STATUSES.map((status) => ({
              value: status,
              label: humanise(status) ?? status,
            })),
          },
          { name: 'batch', label: 'Batch', type: 'select', options: options.batches },
          { name: 'dateFrom', label: 'From', type: 'date' },
          { name: 'dateTo', label: 'To', type: 'date' },
        ]}
      />

      <Section
        title="Report catalogue"
        description="Excel, CSV, PDF and print for every report, with the filters above applied."
        className="mb-7"
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {catalogue.map((report) => {
            const Icon = report.icon;

            return (
              <div
                key={report.dataset}
                className="surface-card rounded-card flex flex-col gap-3 px-4 py-3.5"
              >
                <div className="flex items-start gap-2.5">
                  <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13.5px] leading-5 font-semibold">{report.title}</h3>
                    <p className="type-caption mt-0.5">{report.description}</p>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                  <span className="type-caption">
                    {report.rows === null
                      ? 'All records in scope'
                      : `${report.rows} ${report.unit}${report.rows === 1 ? '' : 's'} in scope`}
                  </span>
                  <ExportMenu dataset={report.dataset} label="Export" />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Previews" description="The same data these exports produce.">
        <Card>
          <CardHeader
            title="Student progress"
            description="Completion counts only activities approved by both reviewers."
            icon={FileBarChart}
            action={<ExportMenu dataset="student-progress" />}
          />
          <DataTable
            caption="Student progress"
            columns={progressColumns}
            searchPlaceholder="Search student, venture or reviewer"
            emptyTitle="No rows match the selected filters"
            emptyDescription="Widen or clear the filters above."
            rows={progress.map((row) => ({
              id: row.studentVentureId,
              cells: [
                {
                  node: (
                    <span className="block min-w-0">
                      <span className="block truncate font-medium">{row.studentName}</span>
                      <span className="type-caption block truncate">{row.studentEmail}</span>
                    </span>
                  ),
                  sort: row.studentName,
                  text: `${row.studentName} ${row.studentEmail}`,
                },
                textCell(row.ventureName),
                textCell(row.facultyName),
                textCell(row.mentorName),
                textCell(row.currentActivity ?? 'All complete'),
                textCell(row.underReview),
                textCell(row.revisionRequired),
                {
                  node: (
                    <span className="flex min-w-32 items-center gap-2">
                      <MeterBar
                        value={row.completed}
                        max={row.total}
                        showValue={false}
                        size="sm"
                        tone={row.percentage === 100 ? 'success' : 'primary'}
                        label={`${row.studentName} progress`}
                      />
                      <span className="type-caption w-12 shrink-0 text-right tabular-nums">
                        {row.completed}/{row.total}
                      </span>
                    </span>
                  ),
                  sort: row.percentage,
                  text: `${row.percentage}%`,
                },
              ],
            }))}
          />
        </Card>

        <Card>
          <CardHeader
            title="Activity completion"
            description="Every Venture Activity, with the cohort's spread across its statuses."
            icon={Activity}
            action={<ExportMenu dataset="activity-completion" />}
          />
          <DataTable
            caption="Activity completion"
            columns={completionColumns}
            searchPlaceholder="Search activity or term"
            emptyTitle="No venture activities match the selected filters"
            pageSize={0}
            rows={completion.map((row) => ({
              id: row.activityCode,
              cells: [
                {
                  node: (
                    <span>
                      <span className="font-mono text-xs font-semibold">{row.activityCode}</span>{' '}
                      {row.name}
                    </span>
                  ),
                  sort: row.activityCode,
                  text: `${row.activityCode} ${row.name}`,
                },
                textCell(row.termName),
                {
                  node: (
                    <span className="block max-w-80 min-w-48">
                      <StackedBar
                        caption={`${row.activityCode} status distribution`}
                        segments={(
                          [
                            { label: 'Not started', value: row.notStarted, tone: 'neutral' },
                            { label: 'In progress', value: row.inProgress, tone: 'primary' },
                            { label: 'Under review', value: row.underReview, tone: 'warning' },
                            { label: 'Revision', value: row.revisionRequired, tone: 'warning' },
                            { label: 'Completed', value: row.completed, tone: 'success' },
                            {
                              label: 'Max attempts',
                              value: row.maxAttemptsReached,
                              tone: 'danger',
                            },
                          ] satisfies Segment[]
                        ).filter((segment) => segment.value > 0)}
                      />
                    </span>
                  ),
                  text: '',
                },
                {
                  node: (
                    <span className="tabular-nums">
                      {row.completed}
                      <span className="text-muted-foreground"> / {row.total}</span>
                    </span>
                  ),
                  sort: row.completed,
                  text: `${row.completed}`,
                },
                {
                  node: <span className="font-semibold tabular-nums">{row.completionRate}%</span>,
                  sort: row.completionRate,
                  text: `${row.completionRate}%`,
                },
              ],
            }))}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Review summary"
              description="Per reviewer, across both review types."
              icon={ClipboardCheck}
              action={<ExportMenu dataset="review-summary" />}
            />
            <DataTable
              caption="Review summary"
              searchPlaceholder="Search reviewer"
              emptyTitle="No reviews match the selected filters"
              pageSize={10}
              columns={[
                { key: 'reviewer', header: 'Reviewer' },
                { key: 'type', header: 'Type', hideBelow: 'sm' },
                { key: 'approved', header: 'Approved', align: 'right' },
                { key: 'revision', header: 'Revision', align: 'right', hideBelow: 'md' },
                { key: 'rejected', header: 'Rejected', align: 'right', hideBelow: 'md' },
                { key: 'pending', header: 'Pending', align: 'right' },
              ]}
              rows={reviewSummary.map((row) => ({
                id: `${row.reviewerId}:${row.reviewerType}`,
                cells: [
                  {
                    node: <span className="font-medium">{row.reviewerName}</span>,
                    sort: row.reviewerName,
                    text: `${row.reviewerName} ${row.reviewerEmail}`,
                  },
                  {
                    node: (
                      <Badge tone={row.reviewerType === 'FACULTY' ? 'info' : 'neutral'}>
                        {row.reviewerType === 'FACULTY' ? 'Faculty' : 'Mentor'}
                      </Badge>
                    ),
                    sort: row.reviewerType,
                    text: row.reviewerType,
                  },
                  textCell(row.approved),
                  textCell(row.revisionRequired),
                  textCell(row.rejected),
                  {
                    node: <span className="font-semibold tabular-nums">{row.pending}</span>,
                    sort: row.pending,
                    text: `${row.pending}`,
                  },
                ],
              }))}
            />
          </Card>

          <Card>
            <CardHeader
              title="Attempts and revisions"
              description={`Activities with at least one submission. Showing up to ${ATTEMPT_PREVIEW}.`}
              icon={RefreshCw}
              action={<ExportMenu dataset="attempts" />}
            />
            <DataTable
              caption="Attempts and revisions"
              searchPlaceholder="Search student or activity"
              emptyTitle="No submissions match the selected filters"
              pageSize={10}
              columns={[
                { key: 'student', header: 'Student' },
                { key: 'activity', header: 'Activity', hideBelow: 'sm' },
                { key: 'used', header: 'Used', align: 'right' },
                { key: 'left', header: 'Left', align: 'right', hideBelow: 'md' },
                { key: 'status', header: 'Status' },
              ]}
              rows={attempts.slice(0, ATTEMPT_PREVIEW).map((row, index) => ({
                id: `${row.studentName}-${row.activityCode}-${index}`,
                cells: [
                  {
                    node: <span className="font-medium">{row.studentName}</span>,
                    sort: row.studentName,
                    text: row.studentName,
                  },
                  {
                    node: (
                      <span>
                        <span className="font-mono text-xs">{row.activityCode}</span>{' '}
                        <span className="text-muted-foreground">{row.activityName}</span>
                      </span>
                    ),
                    sort: row.activityCode,
                    text: `${row.activityCode} ${row.activityName}`,
                  },
                  {
                    node: (
                      <span className="tabular-nums">
                        {row.attemptsUsed}
                        <span className="text-muted-foreground"> / {row.maxAttempts}</span>
                      </span>
                    ),
                    sort: row.attemptsUsed,
                    text: `${row.attemptsUsed}`,
                  },
                  textCell(row.attemptsRemaining),
                  {
                    node: (
                      <Badge
                        tone={
                          row.status === 'COMPLETED'
                            ? 'success'
                            : row.status === 'MAX_ATTEMPTS_REACHED'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {humanise(row.status)}
                      </Badge>
                    ),
                    sort: row.status,
                    text: humanise(row.status) ?? row.status,
                  },
                ],
              }))}
            />
          </Card>
        </div>
      </Section>
    </>
  );
}
