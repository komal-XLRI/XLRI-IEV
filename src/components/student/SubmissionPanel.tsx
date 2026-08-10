'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '@/components/forms/ActionForm';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { EvidenceUploader } from './EvidenceUploader';
import { submitActivityAction } from '@/app/actions/studentActions';
import type { EvidenceItem } from '@/components/venture/EvidenceList';
import type { TimelineRow } from '@/types/progress';

/**
 * Submit button that also knows about the evidence rule.
 *
 * `useFormStatus` only works inside the form, and the reason a submission is
 * blocked belongs next to the control that is blocked — not in a banner
 * elsewhere on the page.
 */
function SubmitAttempt({
  attemptNumber,
  blocked,
  uploading,
}: {
  attemptNumber: number;
  blocked: boolean;
  uploading: boolean;
}) {
  const { pending } = useFormStatus();
  const disabled = pending || blocked || uploading;

  return (
    <div className="space-y-1.5">
      <Button type="submit" disabled={disabled}>
        {pending ? 'Submitting…' : `Submit attempt ${attemptNumber}`}
      </Button>

      {blocked && !pending ? (
        <p className="type-caption text-warning-soft-foreground">
          Attach at least one evidence file to enable submission.
        </p>
      ) : null}
      {uploading && !blocked ? (
        <p className="type-caption">Waiting for the upload to finish…</p>
      ) : null}
    </div>
  );
}

/**
 * Single-step submission: evidence is staged against the activity record and
 * adopted by the attempt when it is created.
 *
 * The panel used to submit first and ask for files afterwards, because evidence
 * needed a submission id to hang from. That made "evidence required" a label
 * rather than a rule — the attempt was already recorded and under review by the
 * time anyone could attach anything. Uploads are now scoped to the record,
 * which exists before the attempt does, so the requirement is enforceable on
 * the server.
 */
export function SubmissionPanel({
  row,
  draftEvidence,
}: {
  row: TimelineRow;
  draftEvidence: EvidenceItem[];
}) {
  const router = useRouter();
  const [evidence, setEvidence] = useState<EvidenceItem[]>(draftEvidence);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);

  /**
   * Realigns with the server when, and only when, the server's answer changes.
   *
   * Comparing during render rather than in an effect is React's own guidance
   * for this: an effect would fire after a wasted render, and — more to the
   * point — it would fight the student, resetting the list they are actively
   * adding to every time the parent re-rendered. The attempt count is in the
   * key so that a refresh after submitting also clears the success card,
   * rather than leaving it pinned over a page that has moved on.
   */
  const serverState = `${row.attemptsUsed}:${draftEvidence.map((file) => file._id).join(',')}`;
  const [syncedState, setSyncedState] = useState(serverState);

  if (syncedState !== serverState) {
    setSyncedState(serverState);
    setEvidence(draftEvidence);
    setSubmitted(null);
  }

  if (submitted !== null) {
    return (
      <Card>
        <CardHeader
          title={`Attempt ${submitted} submitted`}
          description="Your faculty reviewer and your industry mentor will both review it."
        />
        <CardBody className="space-y-4">
          <FormMessage tone="success">
            Your submission is recorded, with its evidence attached, and is now awaiting two
            independent reviews.
          </FormMessage>

          <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}>
            View submission history
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (!row.canSubmit) {
    return (
      <Card>
        <CardHeader title="Submission" />
        <CardBody>
          <FormMessage tone="info">
            {row.blockedReason ?? 'Submission is not available for this activity right now.'}
          </FormMessage>
          {row.attemptsRemaining === 0 && row.status !== 'COMPLETED' ? (
            <p className="text-muted-foreground mt-3 text-sm">
              All {row.maxAttempts} attempts have been used. Contact your programme office if you
              need the attempt limit reviewed.
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const blocked = row.evidenceRequired && evidence.length === 0;

  return (
    <Card>
      <CardHeader
        title={
          row.attemptsUsed === 0
            ? 'Submit this activity'
            : `Resubmit — attempt ${row.nextAttemptNumber} of ${row.maxAttempts}`
        }
        description={
          row.attemptsUsed === 0
            ? 'Describe what you did. Both your faculty and your mentor must approve it.'
            : 'Your previous attempt and its feedback stay on record; this creates a new attempt.'
        }
      />
      <CardBody>
        <ActionForm
          action={submitActivityAction}
          onSuccess={(data) => setSubmitted(data.attemptNumber)}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="studentVentureActivityId" value={row.recordId} />

              <Field label="Title" htmlFor="title" error={fieldErrors?.title}>
                <TextInput
                  id="title"
                  name="title"
                  placeholder="A short summary of this submission"
                />
              </Field>

              <Field
                label="What you did"
                htmlFor="content"
                required
                hint="Describe the work, findings and outcomes for this activity."
                error={fieldErrors?.content}
              >
                <TextArea id="content" name="content" rows={8} required />
              </Field>

              <Field label="Remarks for your reviewers" htmlFor="remarks">
                <TextArea id="remarks" name="remarks" rows={3} />
              </Field>

              <EvidenceUploader
                studentVentureActivityId={row.recordId}
                required={row.evidenceRequired}
                evidence={evidence}
                onEvidenceChange={setEvidence}
                onBusyChange={setUploading}
              />

              <SubmitAttempt
                attemptNumber={row.nextAttemptNumber}
                blocked={blocked}
                uploading={uploading}
              />
            </div>
          )}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
