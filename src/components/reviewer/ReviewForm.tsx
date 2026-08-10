'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleSlash, RotateCcw, type LucideIcon } from 'lucide-react';
import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, TextArea } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { ReviewStatusBadge } from '@/components/ui/Badge';
import { submitReviewAction } from '@/app/actions/reviewActions';
import { REVIEW_DECISIONS, type ReviewStatus } from '@/lib/constants/status';
import { cn } from '@/lib/utils/cn';

const DECISION_LABELS: Record<(typeof REVIEW_DECISIONS)[number], string> = {
  APPROVED: 'Approve',
  REVISION_REQUIRED: 'Request revision',
  REJECTED: 'Reject',
};

const DECISION_ICONS: Record<(typeof REVIEW_DECISIONS)[number], LucideIcon> = {
  APPROVED: CheckCircle2,
  REVISION_REQUIRED: RotateCcw,
  REJECTED: CircleSlash,
};

/** What each verdict means for the student, so the choice is not a guess. */
const DECISION_HINTS: Record<(typeof REVIEW_DECISIONS)[number], string> = {
  APPROVED: 'Your half of the dual review',
  REVISION_REQUIRED: 'Student may resubmit',
  REJECTED: 'Uses an attempt',
};

const DECISION_STYLES: Record<(typeof REVIEW_DECISIONS)[number], string> = {
  APPROVED:
    'peer-checked:border-success peer-checked:bg-success-soft peer-checked:text-success-soft-foreground',
  REVISION_REQUIRED:
    'peer-checked:border-warning peer-checked:bg-warning-soft peer-checked:text-warning-soft-foreground',
  REJECTED:
    'peer-checked:border-danger peer-checked:bg-danger-soft peer-checked:text-danger-soft-foreground',
};

export function ReviewForm({
  submissionId,
  reviewerType,
  alreadyReviewed,
  isCurrentAttempt,
  myStatus,
  otherStatus,
  existingComments,
}: {
  submissionId: string;
  reviewerType: 'FACULTY' | 'MENTOR';
  alreadyReviewed: boolean;
  isCurrentAttempt: boolean;
  myStatus: ReviewStatus;
  otherStatus: ReviewStatus;
  existingComments: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  const label = reviewerType === 'FACULTY' ? 'Faculty review' : 'Mentor review';

  if (alreadyReviewed || done) {
    return (
      <Card>
        <CardHeader title={label} description="Your verdict for this attempt is recorded." />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <ReviewStatusBadge prefix="You" status={done ? myStatus : myStatus} />
            <ReviewStatusBadge
              prefix={reviewerType === 'FACULTY' ? 'Mentor' : 'Faculty'}
              status={otherStatus}
            />
          </div>

          {existingComments ? (
            <p className="text-sm whitespace-pre-wrap">{existingComments}</p>
          ) : null}

          <p className="text-muted-foreground text-sm">
            Reviews are immutable. If the student resubmits, a fresh review is created for the new
            attempt.
          </p>

          <button
            type="button"
            className="text-primary text-sm hover:underline"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </CardBody>
      </Card>
    );
  }

  if (!isCurrentAttempt) {
    return (
      <Card>
        <CardHeader title={label} />
        <CardBody>
          <FormMessage tone="info">
            This attempt has been superseded by a newer submission and can no longer be reviewed.
          </FormMessage>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={label}
        description="Your decision covers this attempt only. The activity completes when both reviewers approve."
      />
      <CardBody>
        <ActionForm action={submitReviewAction} onSuccess={() => setDone(true)}>
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="submissionId" value={submissionId} />

              {/* What this verdict will actually do, stated before the choice:
                  an approval only completes the activity if the other reviewer
                  has already approved. */}
              <div className="surface-sunken rounded-control border px-3 py-2.5">
                <p className="type-overline mb-1">Effect of your decision</p>
                <p className="type-secondary">
                  {otherStatus === 'APPROVED' ? (
                    <>
                      The {reviewerType === 'FACULTY' ? 'mentor' : 'faculty reviewer'} has already
                      approved this attempt.{' '}
                      <span className="text-foreground font-medium">
                        Approving now completes the activity.
                      </span>
                    </>
                  ) : (
                    <>
                      The {reviewerType === 'FACULTY' ? 'mentor' : 'faculty reviewer'} has not
                      approved this attempt yet, so it stays under review even if you approve.
                    </>
                  )}
                </p>
              </div>

              <fieldset>
                <legend className="mb-2 text-[13.5px] font-medium">
                  Decision{' '}
                  <span className="text-danger-soft-foreground" aria-hidden="true">
                    *
                  </span>
                  <span className="sr-only">(required)</span>
                </legend>
                <div className="space-y-2">
                  {REVIEW_DECISIONS.map((decision) => {
                    const Icon = DECISION_ICONS[decision];

                    return (
                      <label key={decision} className="block cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value={decision}
                          required
                          className="peer sr-only"
                        />
                        {/* The selected option is marked by a tinted fill, a
                            border and a filled radio dot — never colour alone. */}
                        <span
                          className={cn(
                            'rounded-control flex items-center gap-2.5 border px-3 py-2.5 text-[13.5px] transition-colors',
                            // A selectable option is a control, so its outline
                            // is held to the control floor rather than the
                            // divider one — otherwise the three choices read as
                            // one block of text until something is picked.
                            'border-input-border hover:bg-surface-hover',
                            'peer-focus-visible:outline-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                            // The dot is a descendant, not a sibling, so it
                            // cannot use `peer-checked:` on its own — the
                            // variant is applied from the sibling that can.
                            'peer-checked:**:data-dot:opacity-100',
                            DECISION_STYLES[decision],
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="border-input-border inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2"
                          >
                            <span
                              data-dot=""
                              className="size-2 rounded-full bg-current opacity-0 transition-opacity"
                            />
                          </span>
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="font-medium">{DECISION_LABELS[decision]}</span>
                          <span className="text-muted-foreground ml-auto text-xs">
                            {DECISION_HINTS[decision]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {fieldErrors?.status ? (
                  <p className="text-danger-soft-foreground mt-1.5 text-xs" role="alert">
                    {fieldErrors.status}
                  </p>
                ) : null}
              </fieldset>

              <Field
                label="Comments"
                htmlFor="comments"
                hint="The student sees this. Be specific about what to change if you are requesting a revision."
                error={fieldErrors?.comments}
              >
                <TextArea id="comments" name="comments" rows={6} />
              </Field>

              <SubmitButton pendingLabel="Recording…">Record {label.toLowerCase()}</SubmitButton>
            </div>
          )}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
