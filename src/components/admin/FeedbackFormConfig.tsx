'use client';

import { ClipboardList } from 'lucide-react';
import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Field';
import { saveFeedbackFormConfigAction } from '@/app/actions/adminVentures';
import { FEEDBACK_PLACEHOLDERS, TOKEN_QUESTION_TITLE } from '@/lib/feedback/googleForm';
import { MAX_REQUIRED_FEEDBACK_COUNT } from '@/lib/rules/mentorFeedback';

/**
 * Which Google Form mentors fill in for this stage. Only the link is stored:
 * the questions live in Google Forms and can be different for every stage.
 */
export function FeedbackFormConfig({
  ventureActivityId,
  prefillUrlTemplate,
  enabled,
  requiredFeedbackCount,
}: {
  ventureActivityId: string;
  prefillUrlTemplate: string | null;
  enabled: boolean;
  requiredFeedbackCount: number;
}) {
  const configured = prefillUrlTemplate !== null;

  return (
    <Card className="mb-4">
      <CardHeader
        title="Mentor feedback form"
        description="The Google Form mentors reach by scanning a presentation's QR. Changing the form here never requires reprinting QR codes."
        icon={ClipboardList}
        action={
          <Badge tone={!configured ? 'warning' : enabled ? 'success' : 'muted'}>
            {!configured ? 'Not configured' : enabled ? 'Active' : 'Paused'}
          </Badge>
        }
      />
      <CardBody>
        <ActionForm action={saveFeedbackFormConfigAction} successMessage="Feedback form saved.">
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="ventureActivityId" value={ventureActivityId} />

              <Field
                label="Google Form pre-filled link"
                htmlFor="prefillUrlTemplate"
                error={fieldErrors?.prefillUrlTemplate}
                hint="Leave blank and save to remove the form from this stage."
              >
                <TextArea
                  id="prefillUrlTemplate"
                  name="prefillUrlTemplate"
                  rows={3}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.…={{IEV_TOKEN}}"
                  defaultValue={prefillUrlTemplate ?? ''}
                />
              </Field>

              <details className="surface-sunken rounded-control border px-3 py-2 text-[13px]">
                <summary className="cursor-pointer font-medium">How to get this link</summary>
                <ol className="type-secondary mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Add a short-answer question titled exactly{' '}
                    <span className="font-mono">{TOKEN_QUESTION_TITLE}</span>.
                  </li>
                  <li>
                    In the form editor open ⋮ → <em>Get pre-filled link</em>.
                  </li>
                  <li>
                    Answer that question with{' '}
                    <span className="font-mono">{FEEDBACK_PLACEHOLDERS.token}</span>. Optionally
                    answer the student, venture and stage questions with{' '}
                    <span className="font-mono">{FEEDBACK_PLACEHOLDERS.student}</span>,{' '}
                    <span className="font-mono">{FEEDBACK_PLACEHOLDERS.venture}</span> and{' '}
                    <span className="font-mono">{FEEDBACK_PLACEHOLDERS.stage}</span>.
                  </li>
                  <li>
                    Click <em>Get link</em> → <em>Copy link</em>, and paste it above.
                  </li>
                </ol>
              </details>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Feedback responses required"
                  htmlFor="requiredFeedbackCount"
                  error={fieldErrors?.requiredFeedbackCount}
                  hint="Mentor responses a received presentation needs before the stage completes."
                >
                  <TextInput
                    id="requiredFeedbackCount"
                    name="requiredFeedbackCount"
                    type="number"
                    min={1}
                    max={MAX_REQUIRED_FEEDBACK_COUNT}
                    defaultValue={requiredFeedbackCount}
                  />
                </Field>
                <div className="sm:pt-7">
                  <Checkbox
                    name="enabled"
                    label="Accept feedback for this stage"
                    defaultChecked={configured ? enabled : true}
                  />
                </div>
              </div>

              <SubmitButton pendingLabel="Saving…">Save feedback form</SubmitButton>
            </div>
          )}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
