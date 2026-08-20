import type { Metadata } from 'next';
import { CalendarCheck, History, Presentation } from 'lucide-react';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { WorkshopCard } from '@/components/student/WorkshopCard';
import { listWorkshopsForStudent } from '@/services/workshops/workshopService';
import { relativeDayLabel } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Workshops' };
export const dynamic = 'force-dynamic';

export default async function StudentWorkshopsPage() {
  await requireRole('STUDENT');

  const { upcoming, past } = await listWorkshopsForStudent();
  const next = upcoming.find((workshop) => workshop.status !== 'CANCELLED');

  return (
    <>
      <PageHeader
        title="Workshops"
        description="Sessions run by the programme office — industry visits, founder talks and masterclasses. These are open to the whole cohort."
        meta={
          next ? (
            <span className="text-muted-foreground text-[13px]">
              Next up: <span className="text-foreground font-medium">{next.title}</span>,{' '}
              {relativeDayLabel(next.date).toLowerCase()}
            </span>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Coming up"
          description={
            upcoming.length === 0
              ? 'Nothing scheduled at the moment.'
              : `${upcoming.length} session(s) still to run`
          }
          icon={CalendarCheck}
        />

        {upcoming.length === 0 ? (
          <EmptyState
            title="No workshops scheduled"
            description="When the programme office publishes a workshop it appears here, and you will get an email about it."
          />
        ) : (
          <CardBody className="space-y-4">
            {upcoming.map((workshop) => (
              <WorkshopCard key={workshop._id.toString()} workshop={workshop} />
            ))}
          </CardBody>
        )}
      </Card>

      {past.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Already held"
            description={`${past.length} past session(s) — open one to see who spoke and where.`}
            icon={History}
          />
          <CardBody className="space-y-2.5">
            {past.map((workshop) => (
              <WorkshopCard key={workshop._id.toString()} workshop={workshop} variant="past" />
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardBody className="flex items-start gap-2.5">
          <span className="bg-info-soft text-info-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <Presentation className="size-3.5" aria-hidden="true" />
          </span>
          <p className="type-secondary">
            Attending a workshop here does not by itself count towards your support activity
            progress. Your <span className="text-foreground font-medium">Expert Workshop (A7)</span>{' '}
            record is logged separately under support activities.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
