import type { Metadata } from 'next';
import { Activity, CalendarCheck, HeartHandshake, ListOrdered } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState, KpiCard, Section } from '@/components/ui/Card';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ImportPanel } from '@/components/import/ImportPanel';
import {
  VentureActivityCard,
  type VentureActivityView,
} from '@/components/admin/VentureActivityCard';
import { VentureActivityForm } from '@/components/admin/VentureActivityForm';
import {
  listSupportActivities,
  listVentureActivities,
  getSupportMappingIndex,
} from '@/services/ventures/ventureActivityService';
import { getActivityCompletionReport } from '@/services/reports/reportService';
import { getAttendanceSummary } from '@/services/ventures/attendanceService';
import { listTerms } from '@/services/academic/academicService';
import { ventureActivityImport } from '@/services/import/specs';
import { windowState } from '@/lib/utils/dates';
import {
  VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS,
  VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS,
} from '@/lib/constants/activities';
import { serialize } from '@/lib/utils/serialize';

export const metadata: Metadata = { title: 'Venture activities' };
export const dynamic = 'force-dynamic';

export default async function VentureActivitiesPage() {
  const [activities, terms, supports, mappingIndex, completion, attendance] = await Promise.all([
    listVentureActivities(),
    listTerms(),
    listSupportActivities(),
    getSupportMappingIndex(),
    getActivityCompletionReport(),
    getAttendanceSummary(),
  ]);

  const supportCodeById = new Map(supports.map((s) => [s._id.toString(), s.activityCode]));
  const completionByCode = new Map(completion.map((row) => [row.activityCode, row]));
  const attendanceById = new Map(attendance.map((row) => [row.ventureActivityId, row]));
  const now = new Date();

  const views: VentureActivityView[] = activities.map((activity) => {
    const id = activity._id.toString();
    const stats = completionByCode.get(activity.activityCode);

    return {
      id,
      activityCode: activity.activityCode,
      name: activity.name,
      termName: activity.termId?.name ?? null,
      startDate: activity.startDate ? activity.startDate.toISOString() : null,
      endDate: activity.endDate ? activity.endDate.toISOString() : null,
      durationDays: activity.durationDays,
      maxAttempts: activity.maxAttempts,
      evidenceRequired: activity.evidenceRequired,
      status: activity.status,
      supportCodes: (mappingIndex[id] ?? [])
        .map((supportId) => supportCodeById.get(supportId))
        .filter((code): code is string => Boolean(code))
        .sort(),
      completed: stats?.completed ?? 0,
      total: stats?.total ?? 0,
      attendance: {
        present: attendanceById.get(id)?.present ?? 0,
        absent: attendanceById.get(id)?.absent ?? 0,
        pending: attendanceById.get(id)?.pending ?? 0,
        total: attendanceById.get(id)?.total ?? 0,
      },
      windowState:
        activity.startDate && activity.endDate
          ? windowState(activity.startDate, activity.endDate, now)
          : null,
    };
  });

  const openNow = views.filter((view) => view.windowState === 'OPEN').length;
  const mapped = views.filter((view) => view.supportCodes.length > 0).length;
  const totalAttemptsAllowance = views.reduce((sum, view) => sum + view.maxAttempts, 0);

  return (
    <>
      <PageHeader
        eyebrow="Venture management"
        title="Venture activities"
        description={`The sequence students progress through. The programme guideline is ${VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS}–${VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS} days each — duration is calculated from the dates you set, never enforced against that range.`}
        action={
          <>
            <ImportPanel
              spec={ventureActivityImport.key}
              title={ventureActivityImport.title}
              description={ventureActivityImport.description}
              columns={ventureActivityImport.columns}
            />
            <ExportMenu dataset="venture-activities" />
            <VentureActivityForm
              terms={serialize(terms).map((t) => ({
                _id: t._id,
                name: t.name,
                termNumber: t.termNumber,
              }))}
            />
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Activities defined"
          value={views.length}
          icon={ListOrdered}
          tone="primary"
        />
        <KpiCard
          label="Windows open now"
          value={openNow}
          hint="Accepting submissions today"
          icon={CalendarCheck}
          tone={openNow > 0 ? 'positive' : 'neutral'}
        />
        <KpiCard
          label="With support mapped"
          value={`${mapped}/${views.length}`}
          hint="Linked to a support activity"
          icon={HeartHandshake}
          tone="accent"
        />
        <KpiCard
          label="Total attempt allowance"
          value={totalAttemptsAllowance}
          hint="Summed across all activities"
          icon={Activity}
        />
      </div>

      {views.length === 0 ? (
        <Card>
          <EmptyState
            title="No venture activities yet"
            description="Run the seed script to load the standard set, import them from CSV, or add one with the button above."
          />
        </Card>
      ) : (
        <Section
          title="Activity definitions"
          description="In programme order. Both a faculty and a mentor approval are required on every one."
        >
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {views.map((view) => (
              <VentureActivityCard key={view.id} activity={view} />
            ))}
          </div>
        </Section>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Support activity coverage"
          description="Which venture activities each support activity feeds — the same mapping, read the other way."
          icon={HeartHandshake}
        />
        <CardBody>
          {supports.length === 0 ? (
            <EmptyState
              size="sm"
              title="No support activities configured"
              description="Support activities are defined under Venture management → Support Activities."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {supports.map((support) => {
                const codes = Object.entries(mappingIndex)
                  .filter(([, supportIds]) => supportIds.includes(support._id.toString()))
                  .map(
                    ([ventureId]) =>
                      activities.find((a) => a._id.toString() === ventureId)?.activityCode,
                  )
                  .filter((code): code is string => Boolean(code))
                  .sort();

                return (
                  <li
                    key={support._id.toString()}
                    className="surface-sunken rounded-control border px-3 py-2"
                  >
                    <p className="text-[13px] font-medium">
                      <span className="font-mono text-xs">{support.activityCode}</span>{' '}
                      {support.name}
                    </p>
                    <p className="type-caption mt-0.5 font-mono">
                      {codes.length > 0 ? codes.join(', ') : 'Not mapped to any venture activity'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
