'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/forms/ActionForm';
import { Modal } from '@/components/ui/Modal';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { saveFeedbackFormConfigAction } from '@/app/actions/adminVentures';
import {
  FEEDBACK_PLACEHOLDERS,
  TOKEN_QUESTION_TITLE,
  checkPrefillTemplate,
} from '@/lib/feedback/googleForm';
import {
  DEFAULT_REQUIRED_FEEDBACK_COUNT,
  MAX_REQUIRED_FEEDBACK_COUNT,
} from '@/lib/rules/mentorFeedback';
import type { PresentationFormView } from '@/services/ventures/mentorFeedbackService';

export interface FormCopySource {
  label: string;
  form: PresentationFormView;
}

/**
 * The Google Form mentors fill in for ONE presentation. Only the link is
 * stored — the questions live in Google Forms. Another presentation's form can
 * be copied in as a starting point, but nothing is shared or inherited: saving
 * here changes this presentation only.
 *
 * The parent remounts this per open (via `key`), so every open starts from the
 * presentation's saved configuration.
 */
export function FeedbackFormModal({
  open,
  onClose,
  presentationId,
  presentationLabel,
  current,
  copySources,
}: {
  open: boolean;
  onClose: () => void;
  presentationId: string;
  presentationLabel: string;
  current: PresentationFormView | null;
  copySources: FormCopySource[];
}) {
  const { notify } = useToast();
  const [title, setTitle] = useState(current?.title ?? '');
  const [template, setTemplate] = useState(current?.prefillUrlTemplate ?? '');
  const [required, setRequired] = useState(
    String(current?.requiredFeedbackCount ?? DEFAULT_REQUIRED_FEEDBACK_COUNT),
  );
  const [enabled, setEnabled] = useState(current?.enabled ?? true);

  function copyFrom(index: string) {
    const source = copySources[Number(index)];
    if (!source) return;
    setTitle(source.form.title ?? '');
    setTemplate(source.form.prefillUrlTemplate);
    setRequired(String(source.form.requiredFeedbackCount));
    setEnabled(source.form.enabled);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={current ? 'Edit feedback form' : 'Configure feedback form'}
      description={`The Google Form mentors reach by scanning a student's QR in ${presentationLabel}. It applies to this presentation only.`}
    >
      <ActionForm
        action={saveFeedbackFormConfigAction}
        onSuccess={() => {
          notify({
            tone: 'success',
            title: template.trim() === '' ? 'Feedback form removed' : 'Feedback form saved',
            description: template.trim() === '' ? undefined : `For ${presentationLabel} only.`,
          });
          onClose();
        }}
      >
        {({ fieldErrors }) => (
          <div className="space-y-4">
            <input type="hidden" name="presentationId" value={presentationId} />

            {copySources.length > 0 ? (
              <Field
                label="Copy from another presentation"
                htmlFor="copyFrom"
                hint="Optional. Fills in the fields below; you can still change them before saving."
              >
                <Select
                  id="copyFrom"
                  defaultValue=""
                  onChange={(event) => copyFrom(event.target.value)}
                >
                  <option value="">Don’t copy</option>
                  {copySources.map((source, index) => (
                    <option key={source.label} value={index}>
                      {source.label}
                      {source.form.title ? ` — ${source.form.title}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field
              label="Form name"
              htmlFor="title"
              hint="For your reference, e.g. the Google Form's title."
              error={fieldErrors?.title}
            >
              <TextInput
                id="title"
                name="title"
                maxLength={200}
                placeholder="Understanding Customers & Market Sizing"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field
              label="Google Form pre-filled link"
              htmlFor="prefillUrlTemplate"
              error={fieldErrors?.prefillUrlTemplate}
              hint="Leave blank and save to remove the form from this presentation."
            >
              <TextArea
                id="prefillUrlTemplate"
                name="prefillUrlTemplate"
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.…={{IEV_TOKEN}}"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              />
            </Field>

            <PrefillCheck template={template} />

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
                  <span className="font-mono">{FEEDBACK_PLACEHOLDERS.token}</span>.
                </li>
                <li>
                  Make the student question a <em>Short answer</em> (not a dropdown — Google cannot
                  prefill a dropdown with each student) and answer it with{' '}
                  <span className="font-mono">
                    {FEEDBACK_PLACEHOLDERS.student} — {FEEDBACK_PLACEHOLDERS.venture}
                  </span>
                  . Optionally answer stage and date questions with{' '}
                  <span className="font-mono">{FEEDBACK_PLACEHOLDERS.stage}</span> and{' '}
                  <span className="font-mono">{FEEDBACK_PLACEHOLDERS.date}</span>.
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
                hint="Mentor responses a received student needs before their stage completes."
              >
                <TextInput
                  id="requiredFeedbackCount"
                  name="requiredFeedbackCount"
                  type="number"
                  min={1}
                  max={MAX_REQUIRED_FEEDBACK_COUNT}
                  value={required}
                  onChange={(event) => setRequired(event.target.value)}
                />
              </Field>
              <div className="sm:pt-7">
                <Checkbox
                  name="enabled"
                  label="Accept feedback for this presentation"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving…">Save feedback form</SubmitButton>
            </div>
          </div>
        )}
      </ActionForm>
    </Modal>
  );
}

const PREFILL_LABELS: Record<keyof typeof FEEDBACK_PLACEHOLDERS, string> = {
  token: 'Presentation ID',
  student: 'Student',
  venture: 'Venture',
  stage: 'Stage',
  date: 'Date',
};

/**
 * What the pasted link will fill in for the mentor. The student is always
 * identified by the QR's token on the server; prefilling the student question
 * only saves the mentor from picking — and from picking the wrong one.
 */
function PrefillCheck({ template }: { template: string }) {
  if (template.trim() === '') return null;
  const check = checkPrefillTemplate(template);
  if (!check.ok) return null; // The field's own error explains it on save.

  const filled = new Set(check.placeholders);
  return (
    <div className="surface-sunken rounded-control space-y-1.5 border px-3 py-2 text-[13px]">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="type-overline mr-1">Prefilled for the mentor</span>
        {(Object.keys(PREFILL_LABELS) as Array<keyof typeof PREFILL_LABELS>).map((key) => (
          <Badge key={key} tone={filled.has(key) ? 'success' : 'muted'}>
            {filled.has(key) ? '✓ ' : ''}
            {PREFILL_LABELS[key]}
          </Badge>
        ))}
      </p>
      {filled.has('student') ? null : (
        <p className="text-warning-soft-foreground">
          The student isn’t prefilled, so mentors will have to choose the student themselves.
          Feedback is still saved against the student whose QR was scanned, but making the student
          question a Short answer prefilled with {FEEDBACK_PLACEHOLDERS.student} avoids the extra
          step.
        </p>
      )}
    </div>
  );
}
