'use client';

import { useState, useTransition } from 'react';
import { MessageSquareText, Pencil, UsersRound } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextArea } from '@/components/ui/Field';
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
import { cn } from '@/lib/utils/cn';

const RATINGS = [1, 2, 3, 4, 5] as const;

function averageTone(average: number) {
  if (average >= 4) return 'success' as const;
  if (average >= 3) return 'info' as const;
  return 'warning' as const;
}

/**
 * One area's rating as five circles, 1 to 5, rather than a dropdown — every
 * option is visible at once, and the meaning of the one chosen is spelt out
 * under it. Native radio buttons underneath, so the keyboard (arrow keys) and
 * the form's required check work as they would on any radio group.
 */
function RatingCircles({
  id,
  name,
  label,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: number | null;
  error?: string;
}) {
  const [value, setValue] = useState<number | null>(defaultValue);

  return (
    <fieldset className="space-y-1.5" aria-describedby={`${id}-meaning`}>
      <legend className="text-sm font-medium">
        {label}
        <span className="text-danger-soft-foreground ml-0.5" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          {RATINGS.map((rating) => (
            <label key={rating} className="relative" title={BEHAVIOUR_RATING_LABELS[rating]}>
              <input
                type="radio"
                name={name}
                value={rating}
                required
                defaultChecked={defaultValue === rating}
                onChange={() => setValue(rating)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'border-input-border text-foreground flex size-9 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  'hover:border-primary peer-focus-visible:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
                  'peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary',
                )}
              >
                {rating}
              </span>
              <span className="sr-only">{BEHAVIOUR_RATING_LABELS[rating]}</span>
            </label>
          ))}
        </div>
        <span id={`${id}-meaning`} className="text-muted-foreground text-xs">
          {value
            ? BEHAVIOUR_RATING_LABELS[value]
            : '1 = needs significant improvement · 5 = excellent'}
        </span>
      </div>
      {error ? (
        <p className="text-danger-soft-foreground text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
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

          <div className="space-y-4">
            {BEHAVIOUR_AREAS.map((area) => (
              <RatingCircles
                key={area.key}
                id={`rating-${row.recordId}-${area.key}`}
                name={`rating.${area.key}`}
                label={area.label}
                defaultValue={row.feedback?.ratings[area.key] ?? null}
                error={fieldErrors?.[`ratings.${area.key}`]}
              />
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

              {row.feedback && row.feedback.missingAreas.length > 0 ? (
                <Badge tone="warning">
                  Re-rate: {row.feedback.missingAreas.length} area
                  {row.feedback.missingAreas.length === 1 ? '' : 's'} not rated
                </Badge>
              ) : row.feedback && row.feedback.average !== null ? (
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
