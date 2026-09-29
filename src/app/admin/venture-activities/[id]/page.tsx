import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/AppShell';
import {
  getSupportActivitiesForVentureActivity,
  getVentureActivity,
  listSupportActivities,
} from '@/services/ventures/ventureActivityService';
import { listPresentationsForActivity } from '@/services/ventures/presentationService';
import { listBehaviourForActivity } from '@/services/ventures/behaviourService';
import { BehaviourPanel } from '@/components/admin/BehaviourPanel';
import { getStageFeedback } from '@/services/ventures/mentorFeedbackService';
import { FeedbackFormConfig } from '@/components/admin/FeedbackFormConfig';
import { MentorFeedbackEntries } from '@/components/venture/MentorFeedbackEntries';
import { AutoRefresh } from '@/components/layout/AutoRefresh';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MessagesSquare } from 'lucide-react';
import { listTerms } from '@/services/academic/academicService';
import { EditVentureActivity } from '@/components/admin/EditVentureActivity';
import { PresentationsPanel } from '@/components/admin/PresentationsPanel';
import { serialize } from '@/lib/utils/serialize';
import { isValidObjectId } from '@/lib/utils/ids';

export const metadata: Metadata = { title: 'Edit venture activity' };
export const dynamic = 'force-dynamic';

export default async function EditVentureActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const [activity, terms, allSupports, mappedSupports, presentations, behaviour, feedback] =
    await Promise.all([
      getVentureActivity(id),
      listTerms(),
      listSupportActivities(),
      getSupportActivitiesForVentureActivity(id),
      listPresentationsForActivity(id),
      listBehaviourForActivity(id),
      getStageFeedback(id),
    ]);

  const withFeedback = presentations.filter(
    (row) => (feedback.byRecord[row.recordId]?.entries.length ?? 0) > 0,
  );

  return (
    <>
      <PageHeader
        title={`${activity.activityCode} · ${activity.name}`}
        description="Student presentations, mentor feedback, HR & behaviour feedback, dates and the support activities that feed this stage."
        action={
          <span className="flex flex-wrap items-center gap-3">
            {/* Attendance moved to its own register; this is the same activity,
                pre-filtered, so the old route into it still leads somewhere. */}
            <Link
              href={`/admin/attendance?ventureActivityId=${id}`}
              className="text-primary text-sm hover:underline"
            >
              Attendance register
            </Link>
            <Link href="/admin/venture-activities" className="text-primary text-sm hover:underline">
              Back to list
            </Link>
          </span>
        }
      />

      <PresentationsPanel
        ventureActivityId={id}
        folderUrl={activity.presentationFolderUrl ?? null}
        rows={presentations}
        feedback={{
          formConfigured: feedback.formConfigured,
          byRecord: Object.fromEntries(
            Object.entries(feedback.byRecord).map(([recordId, summary]) => [
              recordId,
              { counted: summary.counted, required: summary.required, complete: summary.complete },
            ]),
          ),
          tally: feedback.tally,
        }}
      />

      {/* Mentor feedback arrives from Google, outside any request on this page. */}
      <AutoRefresh />

      <FeedbackFormConfig
        ventureActivityId={id}
        prefillUrlTemplate={feedback.prefillUrlTemplate}
        enabled={feedback.formEnabled}
        requiredFeedbackCount={feedback.requiredFeedbackCount}
      />

      {withFeedback.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title="Mentor feedback received"
            description="Responses from the stage's Google Form. A mentor's earlier response is kept but marked superseded when they submit again."
            icon={MessagesSquare}
          />
          <CardBody className="space-y-2">
            {withFeedback.map((row) => {
              const summary = feedback.byRecord[row.recordId]!;
              return (
                <details key={row.recordId} className="rounded-control border">
                  <summary className="hover:bg-surface-hover flex cursor-pointer flex-wrap items-center gap-2 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                      {row.studentName}
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        · {row.ventureName}
                      </span>
                    </span>
                    <span className="type-caption tabular-nums">
                      {summary.counted}/{summary.required} counted
                    </span>
                    {summary.complete ? <Badge tone="success">Complete</Badge> : null}
                  </summary>
                  <div className="border-t p-3">
                    <MentorFeedbackEntries entries={summary.entries} showSuperseded />
                  </div>
                </details>
              );
            })}
          </CardBody>
        </Card>
      ) : null}

      <BehaviourPanel rows={behaviour} />

      <EditVentureActivity
        activity={serialize({
          _id: activity._id,
          activityCode: activity.activityCode,
          name: activity.name,
          description: activity.description ?? '',
          termId: activity.termId._id,
          order: activity.order,
          startDate: activity.startDate,
          endDate: activity.endDate,
          durationDays: activity.durationDays,
          status: activity.status,
        })}
        terms={serialize(terms).map((t) => ({
          _id: t._id,
          name: t.name,
          termNumber: t.termNumber,
        }))}
        supportActivities={serialize(allSupports).map((s) => ({
          _id: s._id,
          activityCode: s.activityCode,
          name: s.name,
        }))}
        mappedSupportIds={mappedSupports.map((s) => s._id.toString())}
      />
    </>
  );
}
