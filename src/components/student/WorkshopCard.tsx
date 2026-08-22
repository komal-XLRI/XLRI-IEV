import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  ExternalLink,
  MapPin,
  Mic,
  UserRound,
  Users,
  Video,
} from 'lucide-react';
import { Badge, WorkshopModeBadge, WorkshopStatusBadge } from '@/components/ui/Badge';
import { WORKSHOP_TYPE_LABELS } from '@/lib/constants/workshops';
import type { WorkshopRecord } from '@/services/workshops/workshopService';
import { formatDate, relativeDayLabel } from '@/lib/utils/dates';

/**
 * A workshop as a student sees it.
 *
 * Everything the programme office recorded is here rather than behind a link:
 * the questions a student has — where is it, how do I join, who is speaking,
 * do I need to register — are all "one glance" questions, and a detail page
 * would put a navigation between them and the answer.
 *
 * A past workshop renders the same content inside a native `<details>`, so the
 * page stays scannable without a line of JavaScript.
 */

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

export function WorkshopCard({
  workshop,
  variant = 'upcoming',
  attendance = null,
}: {
  workshop: WorkshopRecord;
  variant?: 'upcoming' | 'past';
  /**
   * This student's own mark, or null if nobody has marked them.
   *
   * Read-only: a student can see what the register says about them and cannot
   * change it. Unmarked shows nothing at all rather than "absent" — nobody has
   * said they were away, only that nobody has said anything.
   */
  attendance?: 'PRESENT' | 'ABSENT' | null;
}) {
  const id = workshop._id.toString();

  if (variant === 'past') {
    return (
      <details
        id={`workshop-${id}`}
        className="border-border bg-surface group rounded-xl border [&[open]>summary]:border-b"
      >
        <summary className="hover:bg-surface-hover border-border flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 transition-colors">
          <ChevronRight
            className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-medium">{workshop.title}</span>
              {workshop.status === 'CANCELLED' ? (
                <WorkshopStatusBadge status={workshop.status} />
              ) : null}
              {attendance ? <AttendanceBadge status={attendance} /> : null}
            </span>
            <span className="type-caption mt-0.5 block">
              {WORKSHOP_TYPE_LABELS[workshop.workshopType]} · {formatDate(workshop.date)} ·{' '}
              {workshop.speakerName}
            </span>
          </span>
        </summary>

        <div className="px-4 py-4">
          <WorkshopBody workshop={workshop} />
        </div>
      </details>
    );
  }

  return (
    <article
      id={`workshop-${id}`}
      className="border-border bg-surface rounded-xl border p-4 sm:p-5"
    >
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="info">{WORKSHOP_TYPE_LABELS[workshop.workshopType]}</Badge>
          <WorkshopModeBadge mode={workshop.mode} />
          {workshop.status === 'CANCELLED' ? (
            <WorkshopStatusBadge status={workshop.status} />
          ) : null}
          {attendance ? <AttendanceBadge status={attendance} /> : null}
          <span className="text-muted-foreground ml-auto text-[13px] font-medium whitespace-nowrap">
            {relativeDayLabel(workshop.date)}
          </span>
        </div>

        <h3 className="text-[17px] leading-6 font-semibold">{workshop.title}</h3>

        {workshop.status === 'CANCELLED' ? (
          <p className="text-danger-soft-foreground bg-danger-soft border-danger-border mt-2 rounded-md border px-2.5 py-2 text-[13px]">
            This workshop has been cancelled. You do not need to attend.
          </p>
        ) : null}
      </header>

      <WorkshopBody workshop={workshop} />
    </article>
  );
}

function WorkshopBody({ workshop }: { workshop: WorkshopRecord }) {
  const cancelled = workshop.status === 'CANCELLED';

  return (
    <>
      {workshop.description ? (
        <p className="type-body mb-4 whitespace-pre-line">{workshop.description}</p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Detail icon={CalendarDays} label="Date">
          {formatDate(workshop.date)}
        </Detail>

        <Detail icon={Clock} label="Time">
          <span className="tabular-nums">
            {workshop.startTime}&ndash;{workshop.endTime}
          </span>{' '}
          <span className="text-muted-foreground">
            ({duration(workshop.startTime, workshop.endTime)})
          </span>
        </Detail>

        {workshop.venue ? (
          <Detail icon={MapPin} label="Venue">
            {workshop.venue}
          </Detail>
        ) : null}

        {workshop.meetingLink && !cancelled ? (
          <Detail icon={Video} label="Joining link">
            <ExternalAnchor href={workshop.meetingLink}>Join the session</ExternalAnchor>
          </Detail>
        ) : null}

        <Detail icon={UserRound} label="Host">
          <Person
            name={workshop.hostName}
            designation={workshop.hostDesignation}
            organisation={workshop.hostOrganisation}
            linkedIn={workshop.hostLinkedIn}
          />
        </Detail>

        <Detail icon={Mic} label="Speaker">
          <Person
            name={workshop.speakerName}
            designation={workshop.speakerDesignation}
            organisation={workshop.speakerOrganisation}
            linkedIn={workshop.speakerLinkedIn}
          />
        </Detail>

        {workshop.maxParticipants ? (
          <Detail icon={Users} label="Seats">
            <span className="tabular-nums">{workshop.maxParticipants}</span> participants
          </Detail>
        ) : null}
      </dl>

      {/* The one thing that is not on the record: a hybrid session that has a
          link but no venue, or the reverse, would leave a student guessing. */}
      {!workshop.venue && !workshop.meetingLink ? (
        <p className="type-caption mt-4">
          Joining details have not been published yet. Watch your email.
        </p>
      ) : null}
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

function Person({
  name,
  designation,
  organisation,
  linkedIn,
}: {
  name: string;
  designation?: string;
  organisation?: string;
  linkedIn?: string;
}) {
  const qualifiers = [designation, organisation].filter(Boolean).join(' · ');

  return (
    <span className="block">
      <span className="font-medium">{name}</span>
      {qualifiers ? <span className="type-caption mt-0.5 block">{qualifiers}</span> : null}
      {linkedIn ? (
        <span className="mt-0.5 block">
          <ExternalAnchor href={linkedIn}>LinkedIn profile</ExternalAnchor>
        </span>
      ) : null}
    </span>
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

/** What the register says about this student, when it says anything. */
function AttendanceBadge({ status }: { status: 'PRESENT' | 'ABSENT' }) {
  return status === 'PRESENT' ? (
    <Badge tone="success" icon={CheckCircle2}>
      You attended
    </Badge>
  ) : (
    <Badge tone="danger" icon={CircleSlash}>
      Marked absent
    </Badge>
  );
}
