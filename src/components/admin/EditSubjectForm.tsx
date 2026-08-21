'use client';

import { SquarePen } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { updateSubjectAction } from '@/app/actions/adminAcademic';
import type { TermOption } from './VentureActivityForm';

export interface EditableSubject {
  _id: string;
  code: string;
  name: string;
  termId: string;
  credits: string;
  area: string;
  description: string;
  status: string;
}

/**
 * Editing a subject.
 *
 * Teaching faculty are assigned by their own control on the row, not here:
 * that is a different question with a different audience, and it already has a
 * place on screen.
 */
export function EditSubjectForm({
  subject,
  terms,
}: {
  subject: EditableSubject;
  terms: TermOption[];
}) {
  return (
    <RecordDialog
      action={updateSubjectAction}
      triggerLabel="Edit"
      triggerIcon={SquarePen}
      triggerVariant="ghost"
      title={`Edit ${subject.code}`}
      description="Subjects are academic units, separate from Venture Activities."
      submitLabel="Save changes"
      successMessage="Subject updated"
    >
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="subjectId" value={subject._id} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Code" htmlFor="code" required error={fieldErrors?.code}>
              <TextInput
                id="code"
                name="code"
                required
                className="font-mono"
                defaultValue={subject.code}
                autoFocus
              />
            </Field>

            <Field label="Term" htmlFor="termId" required error={fieldErrors?.termId}>
              <Select id="termId" name="termId" required defaultValue={subject.termId}>
                {terms.map((term) => (
                  <option key={term._id} value={term._id}>
                    {term.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Credits" htmlFor="credits" error={fieldErrors?.credits}>
              <TextInput
                id="credits"
                name="credits"
                type="number"
                min={0}
                defaultValue={subject.credits}
              />
            </Field>

            <Field label="Status" htmlFor="status" error={fieldErrors?.status}>
              <Select id="status" name="status" defaultValue={subject.status}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>

          <Field label="Name" htmlFor="name" required error={fieldErrors?.name}>
            <TextInput id="name" name="name" required defaultValue={subject.name} />
          </Field>

          <Field label="Area" htmlFor="area" error={fieldErrors?.area}>
            <TextInput id="area" name="area" defaultValue={subject.area} />
          </Field>

          <Field label="Description" htmlFor="description" error={fieldErrors?.description}>
            <TextArea
              id="description"
              name="description"
              rows={3}
              defaultValue={subject.description}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
