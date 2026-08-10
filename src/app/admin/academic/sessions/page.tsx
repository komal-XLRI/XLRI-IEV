import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Badge } from '@/components/ui/Badge';
import { listSessions, listSubjects } from '@/services/academic/academicService';
import { listSupportActivities } from '@/services/ventures/ventureActivityService';
import { listReviewersByRole } from '@/services/users/userService';
import { SessionForm } from '@/components/admin/SessionForm';
import { formatDate } from '@/lib/utils/dates';
import { humanise } from '@/lib/utils/humanise';
import { serialize } from '@/lib/utils/serialize';
import { ExportMenu } from '@/components/export/ExportMenu';

export const metadata: Metadata = { title: 'Classes' };
export const dynamic = 'force-dynamic';

export default async function AdminSessionsPage() {
  const [sessions, subjects, faculty, supports] = await Promise.all([
    listSessions(),
    listSubjects(),
    listReviewersByRole('FACULTY'),
    listSupportActivities(),
  ]);

  const columns: DataColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time', hideBelow: 'sm' },
    { key: 'subject', header: 'Subject' },
    { key: 'faculty', header: 'Faculty', hideBelow: 'md' },
    { key: 'type', header: 'Type', hideBelow: 'lg' },
    { key: 'support', header: 'Support activity' },
    { key: 'topic', header: 'Topic', hideBelow: 'xl', clamp: true, toggleable: true },
  ];

  return (
    <Card>
      <CardHeader
        title="Scheduled classes"
        description="A class linked to a support activity is how Expert Workshops are scheduled — there is no separate workshop system."
        icon={CalendarDays}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu dataset="sessions" />
            <SessionForm
              subjects={serialize(subjects).map((s) => ({
                _id: s._id,
                code: s.code,
                name: s.name,
              }))}
              faculty={serialize(faculty).map((f) => ({
                _id: f._id,
                name: f.name,
                email: f.email,
              }))}
              supportActivities={serialize(supports).map((s) => ({
                _id: s._id,
                activityCode: s.activityCode,
                name: s.name,
              }))}
            />
          </div>
        }
      />

      <DataTable
        caption="Scheduled classes"
        columns={columns}
        searchPlaceholder="Search subject, faculty or topic"
        emptyTitle="No classes scheduled"
        emptyDescription="Add one with the button above. Link it to a support activity to schedule an Expert Workshop."
        rows={sessions.map((session) => ({
          id: session._id.toString(),
          cells: [
            {
              node: <span className="whitespace-nowrap">{formatDate(session.date)}</span>,
              sort: session.date ? new Date(session.date).toISOString() : '',
              text: formatDate(session.date),
            },
            {
              node: (
                <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                  {session.startTime}&ndash;{session.endTime}
                </span>
              ),
              sort: session.startTime,
              text: `${session.startTime} ${session.endTime}`,
            },
            {
              node: (
                <span>
                  <span className="font-mono text-xs font-semibold">{session.subjectId?.code}</span>{' '}
                  {session.subjectId?.name}
                </span>
              ),
              sort: session.subjectId?.code ?? '',
              text: `${session.subjectId?.code ?? ''} ${session.subjectId?.name ?? ''}`,
            },
            textCell(session.facultyId?.name),
            {
              node: <Badge tone="neutral">{humanise(session.sessionType)}</Badge>,
              sort: session.sessionType,
              text: humanise(session.sessionType) ?? session.sessionType,
            },
            {
              node: session.supportActivityId ? (
                <Badge tone="info">
                  <span className="font-mono">{session.supportActivityId.activityCode}</span>{' '}
                  {session.supportActivityId.name}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
              sort: session.supportActivityId?.activityCode ?? '',
              text: session.supportActivityId
                ? `${session.supportActivityId.activityCode} ${session.supportActivityId.name}`
                : '',
            },
            textCell(session.topic),
          ],
        }))}
      />
    </Card>
  );
}
