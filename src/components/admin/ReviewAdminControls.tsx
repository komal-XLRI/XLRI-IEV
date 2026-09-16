'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { ActionForm } from '@/components/forms/ActionForm';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { deleteReviewAction, updateReviewAction } from '@/app/actions/adminReviews';
import { REVIEW_DECISIONS } from '@/lib/constants/status';
import type { ReviewerType } from '@/lib/constants/status';

const DECISION_LABEL: Record<(typeof REVIEW_DECISIONS)[number], string> = {
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision required',
  REJECTED: 'Rejected',
};

export interface EditableReview {
  reviewId: string;
  reviewerType: ReviewerType;
  reviewerName: string;
  status: string;
  comments: string;
}

/**
 * Correcting and removing a verdict, for administrators.
 *
 * Both warn about the same thing, because both do it: the activity is
 * recomputed from whatever verdicts remain, so a completed activity whose
 * approval is changed or removed goes back under review, and the student sees
 * that happen. Anything gentler would be a lie about what the button does.
 *
 * The reviewer is not editable. An edit fixes what was decided, not who
 * decided it — a verdict filed against the wrong person is deleted and filed
 * again, which leaves a record of both.
 */
export function ReviewAdminControls({
  review,
  variant = 'icon',
}: {
  review: EditableReview;
  variant?: 'icon' | 'button';
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const label = review.reviewerType === 'FACULTY' ? 'faculty' : 'mentor';

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('reviewId', review.reviewId);

      const result = await deleteReviewAction(null, formData);
      setConfirming(false);

      notify(
        result.ok
          ? {
              tone: 'success',
              title: 'Review deleted',
              description: `The ${label} half is pending again.`,
            }
          : { tone: 'error', title: 'Could not delete the review', description: result.message },
      );
    });
  }

  return (
    <>
      <span className="inline-flex items-center gap-0.5">
        {variant === 'button' ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit the ${label} review by ${review.reviewerName}`}
              title="Edit"
              className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center transition-colors"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              aria-label={`Delete the ${label} review by ${review.reviewerName}`}
              title="Delete"
              className="text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </span>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        size="md"
        title="Correct this review"
        description={`${review.reviewerName} · ${label} verdict`}
      >
        <ActionForm
          action={updateReviewAction}
          onSuccess={() => {
            setEditing(false);
            notify({ tone: 'success', title: 'Review updated' });
          }}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="reviewId" value={review.reviewId} />

              <Field label="Decision" htmlFor="status" required error={fieldErrors?.status}>
                <Select id="status" name="status" required defaultValue={review.status}>
                  {REVIEW_DECISIONS.map((decision) => (
                    <option key={decision} value={decision}>
                      {DECISION_LABEL[decision]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Comments"
                htmlFor="comments"
                error={fieldErrors?.comments}
                hint="The student reads this word for word."
              >
                <TextArea
                  id="comments"
                  name="comments"
                  rows={5}
                  maxLength={4000}
                  defaultValue={review.comments}
                />
              </Field>

              <p className="border-warning-border bg-warning-soft text-warning-soft-foreground rounded-control border px-3 py-2 text-[13px]">
                The activity is recalculated from both verdicts when you save. Changing an approval
                to anything else takes a completed activity back under review, and the next activity
                locks again. Your name is recorded against the correction.
              </p>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">Save correction</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      </Modal>

      <ConfirmDialog
        open={confirming}
        busy={pending}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title={`Delete ${review.reviewerName}'s ${label} review?`}
        confirmLabel="Delete review"
        message={
          <>
            <p>
              The {label} half goes back to pending and the activity is recalculated. If it was
              complete, it returns to under review and the next activity locks again.
            </p>
            <p className="text-muted-foreground mt-2">
              To change the verdict rather than remove it, edit it instead — that keeps a record of
              who decided what.
            </p>
          </>
        }
      />
    </>
  );
}
