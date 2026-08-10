import type { Metadata } from 'next';
import { CalendarDays, HeartHandshake, Info, Link2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard, Section } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/export/ExportMenu';
import { SupportActivityForm } from '@/components/admin/SupportActivityForm';
import {
  getVentureActivitiesForSupportActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { EXPERT_WORKSHOP_CODE } from '@/lib/constants/activities';
import { serialize } from '@/lib/utils/serialize';
import { humanise } from '@/services/export/filterLabels';

export const metadata: Metadata = { title: 'Support activities' };
export const dynamic = 'force-dynamic';

export default async function SupportActivitiesPage() {
  const supports = await listSupportActivities();

  const mapped = await Promise.all(
    supports.map(async (support) => ({
      support,
      ventureActivities: await getVentureActivitiesForSupportActivity(support._id.toString()),
    })),
  );

  const scheduled = mapped.filter(({ support }) => support.scheduleType === 'ACADEMIC_SESSION');
  const linked = mapped.filter(({ ventureActivities }) => ventureActivities.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Support activities"
        description="The activities that feed the venture pipeline. Unlike Venture Activities they are not sequenced, carry no attempt limit, and are not dual-reviewed."
        action={
          <>
            <ExportMenu dataset="support-activities" />
            <SupportActivityForm />
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Support activities"
          value={supports.length}
          icon={HeartHandshake}
          tone="accent"
        />
        <KpiCard
          label="Scheduled as classes"
          value={scheduled.length}
          hint="Run through the academic timetable"
          icon={CalendarDays}
          tone="primary"
        />
        <KpiCard
          label="Mapped to a venture activity"
          value={`${linked.length}/${supports.length}`}
          hint="Feeding at least one activity"
          icon={Link2}
        />
      </div>

      {/* The Expert Workshop is a support activity scheduled through the
          academic timetable — not a separate concept with its own records. */}
      <Card className="mb-5">
        <CardBody className="flex items-start gap-2.5">
          <span className="bg-info-soft text-info-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <Info className="size-3.5" aria-hidden="true" />
          </span>
          <p className="type-secondary">
            Expert Workshops (<span className="font-mono">{EXPERT_WORKSHOP_CODE}</span>) are one of
            these support activities, scheduled as subject sessions rather than in a separate
            workshop system. Attach them to a class under{' '}
            <span className="text-foreground font-medium">Academic → Classes</span>.
          </p>
        </CardBody>
      </Card>

      {supports.length === 0 ? (
        <Card>
          <EmptyState
            title="No support activities configured"
            description="Add the first one with the button above, or run the seed script to load the standard set."
          />
        </Card>
      ) : (
        <Section
          title="Definitions"
          description="Each one can feed many venture activities, and each venture activity can require many of these."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {mapped.map(({ support, ventureActivities }) => (
              <Card key={support._id.toString()}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="bg-accent-soft text-accent-soft-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-bold">
                        {support.activityCode}
                      </span>
                      {support.name}
                    </span>
                  }
                  description={support.description ?? undefined}
                  action={
                    <Badge tone={support.scheduleType === 'ACADEMIC_SESSION' ? 'info' : 'neutral'}>
                      {humanise(support.scheduleType) ?? support.scheduleType}
                    </Badge>
                  }
                />
                <CardBody className="space-y-3">
                  <div>
                    <p className="type-overline mb-1">Feeds these venture activities</p>
                    {ventureActivities.length === 0 ? (
                      <p className="type-caption">Not mapped to any venture activity yet.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-1">
                        {ventureActivities.map((activity) => (
                          <li key={activity._id.toString()}>
                            <Badge tone="neutral" className="font-mono">
                              {activity.activityCode}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <details className="group">
                    <summary className="text-primary cursor-pointer list-none text-[13px] font-medium hover:underline">
                      Edit definition
                    </summary>
                    <div className="mt-3 border-t pt-3">
                      <SupportActivityForm existing={serialize(support)} compact />
                    </div>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
