'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, ListChecks, RotateCcw } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { markStageCompleteAction, reopenStageAction } from '@/app/actions/adminVentures';
import type { StageCompletionRow } from '@/services/ventures/stageCompletionService';
import type { Serialized } from '@/lib/utils/serialize';
import { formatDate } from '@/lib/utils/dates';

type Row = Serialized<StageCompletionRow>;

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  PRESENTATION_RECEIVED: 'Presented',
  UNDER_REVIEW: 'Under review',
  REVISION_REQUIRED: 'Revision required',
  COMPLETED: 'Complete',
};

/**
 * Marking this stage complete for students by hand — for when feedback was
 * collected outside the feedback form. Completing a stage unlocks the next one
 * for that student, exactly as mentor feedback would.
 */
export function StageCompletionPanel({
  ventureActivityId,
  activityCode,
  rows,
}: {
  ventureActivityId: string;
  activityCode: string;
  rows: Row[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'complete' | 'reopen' | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const completed = rows.filter((row) => row.status === 'COMPLETED').length;
  const chosen = rows.filter((row) => selected.has(row.recordId));
  const toComplete = chosen.filter((row) => row.status !== 'COMPLETED');
  const toReopen = chosen.filter((row) => row.markedByAdmin);
  const lockedChosen = toComplete.filter((row) => !row.previousComplete).length;

  function toggle(recordId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }

  function run(kind: 'complete' | 'reopen') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('ventureActivityId', ventureActivityId);
      for (const row of kind === 'complete' ? toComplete : toReopen) {
        formData.append('recordIds', row.recordId);
      }

      if (kind === 'complete') {
        const result = await markStageCompleteAction(null, formData);
        notify(
          result.ok
            ? {
                tone: 'success',
                title: `${activityCode} marked complete for ${result.data.completed} student(s)`,
                description: 'Their next stage is now open.',
              }
            : { tone: 'error', title: 'Could not mark complete', description: result.message },
        );
        if (result.ok) setSelected(new Set());
      } else {
        const result = await reopenStageAction(null, formData);
        notify(
          result.ok
            ? {
                tone: 'success',
                title: `${activityCode} reopened for ${result.data.reopened} student(s)`,
              }
            : { tone: 'error', title: 'Could not reopen', description: result.message },
        );
        if (result.ok) setSelected(new Set());
      }
      setConfirm(null);
    });
  }

  const allOpen = rows.filter((row) => row.status !== 'COMPLETED');

  return (
    <Card className="mb-4">
      <CardHeader
        title="Stage completion"
        description="A stage completes when mentor feedback comes in through the feedback form. If feedback was collected another way, mark students complete here — their next stage opens straight away."
        icon={ListChecks}
        action={
          rows.length > 0 ? (
            <Badge tone={completed === rows.length ? 'success' : 'neutral'}>
              {completed}/{rows.length} complete
            </Badge>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="No students on this stage"
          description="Students appear here once they have a venture."
        />
      ) : (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={allOpen.length === 0}
              onClick={() => setSelected(new Set(allOpen.map((row) => row.recordId)))}
            >
              Select all not complete ({allOpen.length})
            </Button>
            {selected.size > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending || toReopen.length === 0}
              onClick={() => setConfirm('reopen')}
              className="gap-1"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reopen ({toReopen.length})
            </Button>
            <Button
              size="sm"
              disabled={pending || toComplete.length === 0}
              onClick={() => setConfirm('complete')}
              className="gap-1"
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Mark complete ({toComplete.length})
            </Button>
          </div>

          <ul className="divide-border rounded-control divide-y border">
            {rows.map((row) => (
              <li key={row.recordId}>
                <label className="hover:bg-surface-hover flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    className="border-input-border accent-primary size-4 rounded border"
                    checked={selected.has(row.recordId)}
                    onChange={() => toggle(row.recordId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{row.studentName}</span>
                    <span className="type-caption block">{row.ventureName}</span>
                  </span>
                  {!row.previousComplete && row.status !== 'COMPLETED' ? (
                    <Badge tone="warning">Previous stage not complete</Badge>
                  ) : null}
                  <Badge tone={row.status === 'COMPLETED' ? 'success' : 'neutral'}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                  {row.status === 'COMPLETED' ? (
                    <span className="type-caption w-full sm:w-auto">
                      {row.markedByAdmin
                        ? `Marked by ${row.completedByName ?? 'an admin'}`
                        : 'On mentor feedback'}
                      {row.completedAt ? ` · ${formatDate(row.completedAt)}` : ''}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </CardBody>
      )}

      <ConfirmDialog
        open={confirm === 'complete'}
        busy={pending}
        tone="primary"
        onClose={() => setConfirm(null)}
        onConfirm={() => run('complete')}
        title={`Mark ${activityCode} complete for ${toComplete.length} student(s)?`}
        confirmLabel="Mark complete"
        message={
          <div className="space-y-2">
            <p>Their next stage opens straight away, and each student is notified.</p>
            {lockedChosen > 0 ? (
              <p>
                {lockedChosen} of them have not completed the stage before this one, so they stay on
                that stage until it is complete too.
              </p>
            ) : null}
          </div>
        }
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        busy={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run('reopen')}
        title={`Reopen ${activityCode} for ${toReopen.length} student(s)?`}
        confirmLabel="Reopen"
        message={
          <p>
            The stage goes back to not complete and the stages after it lock again. Only stages
            marked complete by hand can be reopened.
          </p>
        }
      />
    </Card>
  );
}
