import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Info, Presentation, Projector } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import {
  getExpertWorkshopId,
  listExpertWorkshopSessions,
} from '@/services/academic/academicService';
import { listWorkshops, getWorkshopSummary } from '@/services/workshops/workshopService';
import { countEmailRecipients } from '@/services/workshops/workshopEmailService';
import { WorkshopTable, type WorkshopRow } from '@/components/admin/WorkshopTable';
import { CreateWorkshopForm } from '@/components/admin/WorkshopForm';
import { formatDate, toDateInputValue } from '@/lib/utils/dates';
import { EXPERT_WORKSHOP_CODE } from '@/lib/constants/activities';
import { ExportMenu } from '@/components/export/ExportMenu';

export const metadata: Metadata = { title: 'Workshops' };
export const dynamic = 'force-dynamic';

export default async function AdminWorkshopsPage() {
  const [workshops, summary, sessions, workshopId, recipientCount] = await Promise.all([
    listWorkshops(),
    getWorkshopSummary(),
    listExpertWorkshopSessions(),
    getExpertWorkshopId(),
    countEmailRecipients(),
  ]);

  // The table is a client component, so ObjectIds and Dates are flattened to
  // the string shapes its inputs already use.
  const rows: WorkshopRow[] = workshops.map((workshop) => ({
    _id: workshop._id.toString(),
    title: workshop.title,
    description: workshop.description ?? '',
    workshopType: workshop.workshopType,
    date: toDateInputValue(workshop.date),
    startTime: workshop.startTime,
    endTime: workshop.endTime,
    mode: workshop.mode,
    venue: workshop.venue ?? '',
    meetingLink: workshop.meetingLink ?? '',
    hostName: workshop.hostName,
    hostDesignation: workshop.hostDesignation ?? '',
    hostOrganisation: workshop.hostOrganisation ?? '',
    hostLinkedIn: workshop.hostLinkedIn ?? '',
    speakerName: workshop.speakerName,
    speakerDesignation: workshop.speakerDesignation ?? '',
    speakerOrganisation: workshop.speakerOrganisation ?? '',
    speakerLinkedIn: workshop.speakerLinkedIn ?? '',
    registrationLink: workshop.registrationLink ?? '',
    maxParticipants: workshop.maxParticipants ? String(workshop.maxParticipants) : '',
    status: workshop.status,
    isEmailSent: workshop.isEmailSent,
    emailSentAt: workshop.emailSentAt ? workshop.emailSentAt.toISOString() : null,
    emailRecipientCount: workshop.emailRecipientCount,
  }));

  const sessionColumns: DataColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time', hideBelow: 'sm' },
    { key: 'subject', header: 'Subject' },
    { key: 'faculty', header: 'Faculty', hideBelow: 'md' },
    { key: 'topic', header: 'Topic', hideBelow: 'lg', clamp: true },
  ];

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="Workshops"
          description={
            summary.total === 0
              ? 'Standalone events with their own host, speaker and joining details.'
              : `${summary.total} workshop(s) · ${summary.published} published · ${summary.upcoming} still to run · ${summary.draft} draft`
          }
          icon={Projector}
          action={<CreateWorkshopForm />}
        />

        <WorkshopTable workshops={rows} recipientCount={recipientCount} />
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Expert Workshops — a different thing with a similar name          */}
      {/* ---------------------------------------------------------------- */}
      <Card className="mb-4">
        <CardBody className="flex items-start gap-2.5">
          <span className="bg-info-soft text-info-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <Info className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="type-secondary">
              The workshops above are standalone events. An{' '}
              <span className="text-foreground font-medium">Expert Workshop</span> is a different
              record: it is support activity{' '}
              <span className="text-foreground font-mono font-medium">{EXPERT_WORKSHOP_CODE}</span>,
              delivered inside the academic timetable, and it is the one that counts towards a
              student&rsquo;s support activity progress.
            </p>

            <p className="type-caption mt-2 flex flex-wrap items-center gap-1.5">
              <span className="bg-accent-soft text-accent-soft-foreground rounded px-1.5 py-0.5 font-mono font-semibold">
                {EXPERT_WORKSHOP_CODE}
              </span>
              <ArrowRight className="size-3" aria-hidden="true" />
              <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-medium">
                Class
              </span>
              <ArrowRight className="size-3" aria-hidden="true" />
              <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-medium">
                Subject
              </span>
            </p>

            <p className="type-caption mt-2">
              Schedule one under{' '}
              <Link
                href="/admin/academic/sessions"
                className="text-primary font-medium hover:underline"
              >
                Classes
              </Link>{' '}
              and select {EXPERT_WORKSHOP_CODE} as its support activity.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Scheduled expert workshops"
          description={`${sessions.length} class(es) linked to ${EXPERT_WORKSHOP_CODE}`}
          icon={Presentation}
          action={
            <ExportMenu
              dataset="sessions"
              extraParams={{ supportActivityId: workshopId ?? undefined }}
            />
          }
        />

        <DataTable
          caption="Scheduled expert workshops"
          columns={sessionColumns}
          searchPlaceholder="Search subject, faculty or topic"
          emptyTitle="No expert workshops scheduled"
          emptyDescription={`Create a class and link support activity ${EXPERT_WORKSHOP_CODE} to it.`}
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
              textCell(session.facultyId?.name),
              textCell(session.topic),
            ],
          }))}
        />
      </Card>
    </>
  );
}
