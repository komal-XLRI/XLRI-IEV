import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Hourglass,
  Mail,
  MapPin,
  Mic,
  Tag,
  Users,
  UserRound,
  Video,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, WorkshopModeBadge, WorkshopStatusBadge } from '@/components/ui/Badge';
import { WORKSHOP_TYPE_LABELS } from '@/lib/constants/workshops';
import { EditWorkshopForm } from '@/components/admin/WorkshopForm';
import { SendWorkshopEmail } from '@/components/admin/SendWorkshopEmail';
import { getWorkshop } from '@/services/workshops/workshopService';
import { getWorkshopFeedback } from '@/services/workshops/workshopFeedbackService';
import { workshopFeedbackImport } from '@/services/import/specs';
import { WorkshopFeedbackPanel } from '@/components/admin/WorkshopFeedbackPanel';
import { WorkshopFeedbackImport } from '@/components/admin/WorkshopFeedbackImport';
import { countEmailRecipients } from '@/services/workshops/workshopEmailService';
import { formatDate, formatDateTime, toDateInputValue } from '@/lib/utils/dates';
import { isValidObjectId } from '@/lib/utils/ids';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Workshop' };
export const dynamic = 'force-dynamic';

/** Minutes between two `HH:mm` slots, rendered as "1h 30m". */
function duration(startTime: string, endTime: string): string {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default async function WorkshopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [workshop, recipientCount, feedback] = await Promise.all([
    getWorkshop(id),
    countEmailRecipients(),
    getWorkshopFeedback(id),
  ]);

  const email = {
    isEmailSent: workshop.isEmailSent,
    emailSentAt: workshop.emailSentAt ? workshop.emailSentAt.toISOString() : null,
    emailRecipientCount: workshop.emailRecipientCount,
  };

  return (
    <>
      <PageHeader
        eyebrow="Workshop"
        title={workshop.title}
        description={`${formatDate(workshop.date)} · ${workshop.startTime}–${workshop.endTime}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <WorkshopStatusBadge status={workshop.status} />
            <Badge tone="info">{WORKSHOP_TYPE_LABELS[workshop.workshopType]}</Badge>
            <WorkshopModeBadge mode={workshop.mode} />
          </span>
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/academic/workshops" className="text-primary text-sm hover:underline">
              Back to list
            </Link>
            {workshop.status === 'PUBLISHED' ? (
              <SendWorkshopEmail
                variant="button"
                workshopId={workshop._id.toString()}
                title={workshop.title}
                recipientCount={recipientCount}
                email={email}
              />
            ) : null}
            <EditWorkshopForm
              variant="button"
              workshop={{
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
                maxParticipants: workshop.maxParticipants ? String(workshop.maxParticipants) : '',
                status: workshop.status,
              }}
            />
          </span>
        }
      />

      <div className="mb-5">
        <WorkshopFeedbackPanel
          feedback={feedback}
          action={
            <WorkshopFeedbackImport
              spec={workshopFeedbackImport.key}
              title={workshopFeedbackImport.title}
              description={workshopFeedbackImport.description}
              columns={workshopFeedbackImport.columns}
              workshopId={id}
            />
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Workshop information" icon={CalendarDays} />
            <CardBody className="space-y-4">
              {workshop.description ? (
                <p className="type-body whitespace-pre-line">{workshop.description}</p>
              ) : (
                <p className="type-secondary">No description was recorded for this workshop.</p>
              )}

              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail icon={Tag} label="Type">
                  {WORKSHOP_TYPE_LABELS[workshop.workshopType]}
                </Detail>
                <Detail icon={CalendarDays} label="Date">
                  {formatDate(workshop.date)}
                </Detail>
                <Detail icon={Clock} label="Time">
                  <span className="tabular-nums">
                    {workshop.startTime}&ndash;{workshop.endTime}
                  </span>
                </Detail>
                <Detail icon={Hourglass} label="Duration">
                  {duration(workshop.startTime, workshop.endTime)}
                </Detail>
                <Detail icon={workshop.mode === 'OFFLINE' ? MapPin : Video} label="Mode">
                  <WorkshopModeBadge mode={workshop.mode} />
                </Detail>

                {workshop.venue ? (
                  <Detail icon={MapPin} label="Venue">
                    {workshop.venue}
                  </Detail>
                ) : null}

                {workshop.meetingLink ? (
                  <Detail icon={Video} label="Meeting link">
                    <ExternalAnchor href={workshop.meetingLink}>Join the session</ExternalAnchor>
                  </Detail>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <PersonCard
              icon={UserRound}
              role="Host"
              name={workshop.hostName}
              designation={workshop.hostDesignation}
              organisation={workshop.hostOrganisation}
              linkedIn={workshop.hostLinkedIn}
            />
            <PersonCard
              icon={Mic}
              role="Speaker"
              name={workshop.speakerName}
              designation={workshop.speakerDesignation}
              organisation={workshop.speakerOrganisation}
              linkedIn={workshop.speakerLinkedIn}
            />
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader title="Attendance" icon={Users} />
          <CardBody>
            <dl className="space-y-4">
              <Detail icon={Users} label="Maximum participants">
                {workshop.maxParticipants ? (
                  <span className="tabular-nums">{workshop.maxParticipants}</span>
                ) : (
                  <span className="text-muted-foreground">No cap set</span>
                )}
              </Detail>

              <Detail icon={Mail} label="Student email">
                {workshop.isEmailSent ? (
                  <span>
                    Sent {formatDateTime(workshop.emailSentAt)} to {workshop.emailRecipientCount}{' '}
                    student{workshop.emailRecipientCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {workshop.status === 'PUBLISHED'
                      ? 'Not sent yet'
                      : 'Publish the workshop to email students'}
                  </span>
                )}
              </Detail>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="type-overline flex items-center gap-1.5">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="type-body mt-1 wrap-break-word">{children}</dd>
    </div>
  );
}

/**
 * `rel="noopener noreferrer"` is not optional on a `target="_blank"` link to a
 * URL an administrator typed: without it the opened page can reach back through
 * `window.opener` and navigate this tab.
 */
function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function PersonCard({
  icon,
  role,
  name,
  designation,
  organisation,
  linkedIn,
}: {
  icon: LucideIcon;
  role: string;
  name: string;
  designation?: string;
  organisation?: string;
  linkedIn?: string;
}) {
  return (
    <Card>
      <CardHeader title={role} icon={icon} />
      <CardBody className="space-y-3">
        <div>
          <p className="text-[15px] font-semibold">{name}</p>
          {designation || organisation ? (
            <p className="type-secondary mt-0.5">
              {[designation, organisation].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>

        {linkedIn ? (
          <ExternalAnchor href={linkedIn}>LinkedIn profile</ExternalAnchor>
        ) : (
          <p className="type-caption">No LinkedIn profile recorded.</p>
        )}
      </CardBody>
    </Card>
  );
}
