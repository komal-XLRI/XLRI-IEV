'use client';

import { useState, useTransition } from 'react';
import { MessageSquareText, Pencil, UsersRound } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { RecordDialog } from './RecordDialog';
import {
  deleteBehaviourFeedbackAction,
  saveBehaviourFeedbackAction,
} from '@/app/actions/adminVentures';
import {
  BEHAVIOUR_AREAS,
  BEHAVIOUR_RATING_LABELS,
  BEHAVIOUR_REVIEW_GUIDELINE_MAX_DAYS,
  BEHAVIOUR_REVIEW_GUIDELINE_MIN_DAYS,
} from '@/lib/constants/behaviour';
import type { BehaviourRow } from '@/services/ventures/behaviourService';
import { formatDate } from '@/lib/utils/dates';

const RATINGS = [5, 4, 3, 2, 1] as const;

function averageTone(average: number) {
  if (average >= 4) return 'success' as const;
  if (average >= 3) return 'info' as const;
  return 'warning' as const;
}

function FeedbackDialog({ row }: { row: BehaviourRow }) {
  const editing = row.feedback !== null;

  return (
    <RecordDialog
      action={saveBehaviourFeedbackAction}
      triggerLabel={editing ? 'Edit' : 'Give feedback'}
      triggerIcon={editing ? Pencil : MessageSquareText}
      triggerVariant={editing ? 'secondary' : 'primary'}
      title={`HR & behaviour — ${row.studentName}`}
      description="Rate each area and add feedback. The student sees this on their activity page."
      submitLabel={editing ? 'Save changes' : 'Give feedback'}
      successMessage={editing ? 'Feedback updated' : 'Feedback given'}
      size="md"
    >
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="studentVentureActivityId" value={row.recordId} />

          <div className="grid gap-4 sm:grid-cols-2">
            {BEHAVIOUR_AREAS.map((area) => (
              <Field
                key={area.key}
                label={area.label}
                htmlFor={`rating-${row.recordId}-${area.key}`}
                required
                error={fieldErrors?.[`ratings.${area.key}`]}
              >
                <Select
                  id={`rating-${row.recordId}-${area.key}`}
                  name={`rating.${area.key}`}
                  required
                  defaultValue={row.feedback ? String(row.feedback.ratings[area.key]) : ''}
                >
                  <option value="" disabled>
                    Choose a rating
                  </option>
                  {RATINGS.map((value) => (
                    <option key={value} value={value}>
                      {value} — {BEHAVIOUR_RATING_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <Field
            label="Feedback"
            htmlFor={`comments-${row.recordId}`}
            error={fieldErrors?.comments}
            hint="What went well, what to work on, and any people issues observed."
          >
            <TextArea
              id={`comments-${row.recordId}`}
              name="comments"
              rows={5}
              defaultValue={row.feedback?.comments ?? ''}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

function RemoveFeedback({ row }: { row: BehaviourRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('studentVentureActivityId', row.recordId);
      const result = await deleteBehaviourFeedbackAction(null, formData);
      setOpen(false);
      notify(
        result.ok
          ? { tone: 'success', title: 'Feedback removed' }
          : { tone: 'error', title: 'Could not remove feedback', description: result.message },
      );
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title={`Remove feedback for ${row.studentName}?`}
        confirmLabel="Remove"
        message={<p>The ratings and comments are deleted and the student no longer sees them.</p>}
      />
    </>
  );
}

/**
 * HR & behaviour for one venture activity.
 *
 * Runs alongside the stage over its window: the programme office observes how
 * each student works with people and records ratings and feedback here. Not
 * linked to any support activity, and it does not decide stage completion.
 */
export function BehaviourPanel({ rows }: { rows: BehaviourRow[] }) {
  const given = rows.filter((row) => row.feedback).length;

  return (
    <Card className="mb-4">
      <CardHeader
        title="HR & behaviour"
        description={`Observe how each student handles people and team issues over ${BEHAVIOUR_REVIEW_GUIDELINE_MIN_DAYS}–${BEHAVIOUR_REVIEW_GUIDELINE_MAX_DAYS} days of this stage, then rate and give feedback. Students see their own feedback.`}
        icon={UsersRound}
        action={
          rows.length > 0 ? (
            <Badge tone={given === rows.length ? 'success' : 'neutral'}>
              {given}/{rows.length} given
            </Badge>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="Nobody is on this activity yet"
          description="Students appear here once their venture has been created."
        />
      ) : (
        <ul className="divide-border divide-y border-t">
          {rows.map((row) => (
            <li key={row.recordId} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{row.studentName}</span>
                <span className="type-caption block truncate">
                  {row.ventureName}
                  {row.feedback ? ` · given ${formatDate(row.feedback.givenAt)}` : ''}
                </span>
              </span>

              {row.feedback ? (
                <Badge tone={averageTone(row.feedback.average)}>
                  Average {row.feedback.average.toFixed(1)} / 5
                </Badge>
              ) : (
                <Badge tone="muted">Not given</Badge>
              )}

              <span className="flex items-center gap-1.5">
                <FeedbackDialog row={row} />
                {row.feedback ? <RemoveFeedback row={row} /> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
