'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { MeterBar } from '@/components/ui/Chart';
import { Badge } from '@/components/ui/Badge';

export interface VentureRow {
  id: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  industry: string | null;
  targetMarket: string | null;
  facultyName: string | null;
  mentorName: string | null;
  currentActivity: string | null;
  completed: number;
  total: number;
  percentage: number;
  status: string;
}

const STATUS_TONE = {
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'info',
  DISCONTINUED: 'muted',
} as const;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  DISCONTINUED: 'Discontinued',
};

/** An unassigned reviewer is a blocker, not a blank — so it says so. */
function Reviewer({ name }: { name: string | null }) {
  if (name) return <>{name}</>;

  return (
    <span className="text-danger-soft-foreground inline-flex items-center gap-1">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      Not assigned
    </span>
  );
}

export function VentureTable({ ventures }: { ventures: VentureRow[] }) {
  const columns: DataColumn[] = [
    { key: 'venture', header: 'Venture' },
    { key: 'student', header: 'Student' },
    { key: 'industry', header: 'Industry', hideBelow: 'lg', toggleable: true },
    { key: 'market', header: 'Target market', hideBelow: 'xl', toggleable: true },
    { key: 'faculty', header: 'Faculty', hideBelow: 'md' },
    { key: 'mentor', header: 'Mentor', hideBelow: 'md' },
    { key: 'current', header: 'Current activity', hideBelow: 'lg' },
    { key: 'progress', header: 'Progress' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: '', align: 'right', sortable: false },
  ];

  const rows: DataRow[] = ventures.map((venture) => ({
    id: venture.id,
    cells: [
      {
        node: <span className="font-medium">{venture.ventureName}</span>,
        sort: venture.ventureName,
        text: venture.ventureName,
      },
      {
        node: (
          <span className="block min-w-0">
            <span className="block truncate">{venture.studentName}</span>
            <span className="type-caption block truncate">{venture.studentEmail}</span>
          </span>
        ),
        sort: venture.studentName,
        text: `${venture.studentName} ${venture.studentEmail}`,
      },
      textCell(venture.industry),
      textCell(venture.targetMarket),
      {
        node: <Reviewer name={venture.facultyName} />,
        // Unassigned sorts first: it is the row that needs work.
        sort: venture.facultyName ?? '',
        text: venture.facultyName ?? 'Not assigned',
      },
      {
        node: <Reviewer name={venture.mentorName} />,
        sort: venture.mentorName ?? '',
        text: venture.mentorName ?? 'Not assigned',
      },
      textCell(venture.currentActivity),
      {
        node: (
          <span className="flex min-w-32 items-center gap-2">
            <MeterBar
              value={venture.completed}
              max={venture.total}
              showValue={false}
              size="sm"
              tone={venture.percentage === 100 ? 'success' : 'primary'}
              label={`${venture.ventureName} progress`}
            />
            <span className="type-caption w-12 shrink-0 text-right tabular-nums">
              {venture.completed}/{venture.total}
            </span>
          </span>
        ),
        sort: venture.percentage,
        text: `${venture.percentage}%`,
      },
      {
        node: (
          <Badge tone={STATUS_TONE[venture.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
            {STATUS_LABEL[venture.status] ?? venture.status}
          </Badge>
        ),
        sort: venture.status,
        text: STATUS_LABEL[venture.status] ?? venture.status,
      },
      {
        node: (
          <Link
            href={`/admin/ventures/${venture.id}`}
            className="text-primary text-[13px] font-medium hover:underline"
          >
            Manage
          </Link>
        ),
      },
    ],
  }));

  return (
    // Searching and reviewer filtering both live in the page's filter bar,
    // which queries every venture rather than the rows already on screen. The
    // Faculty and Mentor selects there are also a more exact way to ask the
    // question this table's box answered by matching a displayed name.
    <DataTable
      caption="Student ventures"
      columns={columns}
      rows={rows}
      searchable={false}
      emptyTitle="No ventures match these filters"
      emptyDescription="Clear the filters above, or create a venture to generate a student's Venture Activity records."
    />
  );
}
