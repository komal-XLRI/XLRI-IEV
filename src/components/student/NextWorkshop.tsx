import Link from 'next/link';
import { ArrowRight, CalendarClock, MapPin, Video } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, WorkshopModeBadge } from '@/components/ui/Badge';
import { WORKSHOP_TYPE_LABELS } from '@/lib/constants/workshops';
import type { WorkshopRecord } from '@/services/workshops/workshopService';
import { formatDate, relativeDayLabel } from '@/lib/utils/dates';

/**
 * The next workshop, on the student's dashboard.
 *
 * A pointer, not a duplicate: enough to know whether to care and when, with
 * the joining details a click away on the workshops page. Renders nothing when
 * there is nothing coming, rather than an empty card that says so — a
 * dashboard tile that is usually blank trains people to stop reading it.
 */
export function NextWorkshop({ workshop }: { workshop: WorkshopRecord | undefined }) {
  if (!workshop) return null;

  const where = workshop.mode === 'ONLINE' ? 'Online' : (workshop.venue ?? 'Venue to be confirmed');

  return (
    <Card className="mt-4">
      <CardHeader
        title="Next workshop"
        icon={CalendarClock}
        action={
          <Link
            href="/student/workshops"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            All workshops
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <CardBody>
        <Link
          href={`/student/workshops#workshop-${workshop._id.toString()}`}
          className="group block"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="info">{WORKSHOP_TYPE_LABELS[workshop.workshopType]}</Badge>
            <WorkshopModeBadge mode={workshop.mode} />
            <span className="text-muted-foreground ml-auto text-[13px] font-medium whitespace-nowrap">
              {relativeDayLabel(workshop.date)}
            </span>
          </div>

          <p className="group-hover:text-primary text-[15px] font-semibold">{workshop.title}</p>

          <p className="type-secondary mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">
              {formatDate(workshop.date)} · {workshop.startTime}&ndash;{workshop.endTime}
            </span>
            <span className="flex items-center gap-1">
              {workshop.mode === 'ONLINE' ? (
                <Video className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {where}
            </span>
          </p>
        </Link>
      </CardBody>
    </Card>
  );
}
