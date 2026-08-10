import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { ActivityTimeline, ProgressBar } from '@/components/venture/ActivityTimeline';
import { getVentureProgress, listVentures } from '@/services/ventures/studentVentureService';
import { toTimeline } from '@/services/ventures/timeline';
import type { Role } from '@/lib/constants/roles';
import { ExportMenu } from '@/components/export/ExportMenu';

/**
 * Read-only progress view for the ventures assigned to this reviewer.
 * Filtering happens in the query, so an unassigned venture is never loaded.
 */
export async function AssignedVentures({
  reviewer,
  basePath,
}: {
  reviewer: { userId: string; role: Extract<Role, 'FACULTY' | 'MENTOR'> };
  basePath: string;
}) {
  const ventures = await listVentures(
    reviewer.role === 'FACULTY' ? { facultyId: reviewer.userId } : { mentorId: reviewer.userId },
  );

  const detailed = await Promise.all(
    ventures.map(async (venture) => ({
      venture,
      rows: toTimeline(await getVentureProgress(venture._id.toString())),
    })),
  );

  return (
    <>
      <PageHeader
        title="My ventures"
        description="Every venture where you are the assigned reviewer."
        action={<ExportMenu dataset="my-ventures" />}
      />

      {detailed.length === 0 ? (
        <Card>
          <EmptyState
            title="No ventures assigned"
            description="The programme office assigns reviewers to each venture."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {detailed.map(({ venture, rows }) => {
            const completed = rows.filter((r) => r.status === 'COMPLETED').length;

            return (
              <Card key={venture._id.toString()}>
                <CardHeader
                  title={venture.ventureName}
                  description={`${venture.studentId?.name ?? 'Unknown'} · ${venture.studentId?.email ?? ''}`}
                />
                <CardBody>
                  <ProgressBar completed={completed} total={rows.length} />
                </CardBody>
                <ActivityTimeline
                  rows={rows}
                  hrefFor={(row) =>
                    row.currentSubmissionId
                      ? `${basePath}/submissions/${row.currentSubmissionId}`
                      : null
                  }
                />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
