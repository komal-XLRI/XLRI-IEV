'use client';

import { SquarePen } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { updateStudentVentureAction } from '@/app/actions/adminVentures';
import { VENTURE_STATUSES } from '@/lib/constants/status';
import { humanise } from '@/lib/utils/humanise';

export interface VentureDetailsValues {
  studentVentureId: string;
  ventureName: string;
  ventureTitle: string;
  industry: string;
  targetMarket: string;
  problemStatement: string;
  solution: string;
  fundingStatus: string;
  status: string;
}

/**
 * Editing a venture's own details.
 *
 * Reviewers are not here on purpose: assigning them is what grants review
 * rights, so it keeps its own form and its own audit trail rather than being
 * one more field in a dialog somebody opened to fix a spelling.
 *
 * Every field is prefilled and every optional one may be emptied — clearing a
 * tagline removes it rather than storing a blank, which is what "edit" has to
 * mean for the screens that print a dash when a value is missing.
 */
export function EditVentureForm({ venture }: { venture: VentureDetailsValues }) {
  return (
    <RecordDialog
      action={updateStudentVentureAction}
      triggerLabel="Edit details"
      triggerIcon={SquarePen}
      triggerVariant="secondary"
      title="Edit venture"
      description="The student sees these details on their own venture page. Reviewers are assigned separately."
      submitLabel="Save changes"
      successMessage="Venture updated"
    >
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="studentVentureId" value={venture.studentVentureId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Venture name"
              htmlFor="ventureName"
              required
              error={fieldErrors?.ventureName}
            >
              <TextInput
                id="ventureName"
                name="ventureName"
                required
                defaultValue={venture.ventureName}
                autoFocus
              />
            </Field>

            <Field label="Status" htmlFor="status" error={fieldErrors?.status}>
              <Select id="status" name="status" defaultValue={venture.status}>
                {VENTURE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {humanise(status)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Tagline"
              htmlFor="ventureTitle"
              hint="One line describing the venture."
              error={fieldErrors?.ventureTitle}
            >
              <TextInput
                id="ventureTitle"
                name="ventureTitle"
                defaultValue={venture.ventureTitle}
              />
            </Field>

            <Field
              label="Funding status"
              htmlFor="fundingStatus"
              error={fieldErrors?.fundingStatus}
            >
              <TextInput
                id="fundingStatus"
                name="fundingStatus"
                defaultValue={venture.fundingStatus}
              />
            </Field>

            <Field label="Industry" htmlFor="industry" error={fieldErrors?.industry}>
              <TextInput id="industry" name="industry" defaultValue={venture.industry} />
            </Field>

            <Field label="Target market" htmlFor="targetMarket" error={fieldErrors?.targetMarket}>
              <TextInput
                id="targetMarket"
                name="targetMarket"
                defaultValue={venture.targetMarket}
              />
            </Field>
          </div>

          <Field
            label="Problem statement"
            htmlFor="problemStatement"
            error={fieldErrors?.problemStatement}
          >
            <TextArea
              id="problemStatement"
              name="problemStatement"
              rows={3}
              defaultValue={venture.problemStatement}
            />
          </Field>

          <Field label="Solution" htmlFor="solution" error={fieldErrors?.solution}>
            <TextArea id="solution" name="solution" rows={3} defaultValue={venture.solution} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
