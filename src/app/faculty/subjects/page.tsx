import type { Metadata } from 'next';
import { CalendarDays, Info, Library } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { Badge } from '@/components/ui/Badge';
import { listSessions, listSubjectsForFaculty } from '@/services/academic/academicService';
import { formatDate } from '@/lib/utils/dates';
import { humanise } from '@/lib/utils/humanise';

export const metadata: Metadata = { title: 'My subjects' };
export const dynamic = 'force-dynamic';

export default async function FacultySubjectsPage() {
  const user = await requireRole('FACULTY');

  const [subjects, sessions] = await Promise.all([
    listSubjectsForFaculty(user.userId),
    listSessions({ facultyId: user.userId }),
  ]);

  const subjectColumns: DataColumn[] = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'term', header: 'Term', hideBelow: 'sm' },
    { key: 'credits', header: 'Credits', align: 'right', hideBelow: 'md' },
    { key: 'status', header: 'Status' },
  ];

  const sessionColumns: DataColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time', hideBelow: 'sm' },
    { key: 'subject', header: 'Subject' },
    { key: 'type', header: 'Type', hideBelow: 'md' },
    { key: 'support', header: 'Support activity' },
    { key: 'topic', header: 'Topic', hideBelow: 'lg', clamp: true },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Academic"
        title="My subjects"
        description="The subjects you teach and the classes scheduled for you."
      />

      {/* The distinction that most often confuses faculty, stated up front. */}
      <Card className="mb-5">
        <CardBody className="flex items-start gap-2.5">
          <span className="bg-info-soft text-info-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <Info className="size-3.5" aria-hidden="true" />
          </span>
          <p className="type-secondary">
            Teaching a subject is separate from venture review. Your review rights come only from
            the ventures where you are the assigned faculty member — see{' '}
            <span className="text-foreground font-medium">My ventures</span>.
          </p>
        </CardBody>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Subjects"
            description={`${subjects.length} assigned to you`}
            icon={Library}
          />
          <DataTable
            caption="Subjects you teach"
            columns={subjectColumns}
            searchPlaceholder="Search code or name"
            emptyTitle="No subjects assigned"
            emptyDescription="The programme office assigns teaching faculty to each subject."
            pageSize={0}
            rows={subjects.map((subject) => ({
              id: subject._id.toString(),
              cells: [
                {
                  node: <span className="font-mono text-xs font-semibold">{subject.code}</span>,
                  sort: subject.code,
                  text: subject.code,
                },
                {
                  node: <span className="font-medium">{subject.name}</span>,
                  sort: subject.name,
                  text: subject.name,
                },
                textCell(subject.termId?.name),
                textCell(subject.credits),
                {
                  node: (
                    <Badge tone={subject.status === 'ACTIVE' ? 'success' : 'muted'}>
                      {subject.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                  sort: subject.status,
                  text: subject.status,
                },
              ],
            }))}
          />
        </Card>

        <Card>
          <CardHeader
            title="My classes"
            description="A class linked to a support activity is delivering that activity — for example an Expert Workshop."
            icon={CalendarDays}
          />
          <DataTable
            caption="Classes scheduled for you"
            columns={sessionColumns}
            searchPlaceholder="Search subject or topic"
            emptyTitle="No classes scheduled"
            emptyDescription="Classes appear here once the programme office schedules them."
            pageSize={15}
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
                      <span className="font-mono text-xs font-semibold">
                        {session.subjectId?.code}
                      </span>{' '}
                      {session.subjectId?.name}
                    </span>
                  ),
                  sort: session.subjectId?.code ?? '',
                  text: `${session.subjectId?.code ?? ''} ${session.subjectId?.name ?? ''}`,
                },
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
      </div>
    </>
  );
}
