'use client';

import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { createSubjectAction } from '@/app/actions/adminAcademic';
import type { TermOption } from './VentureActivityForm';

export function SubjectForm({ terms }: { terms: TermOption[] }) {
  return (
    <RecordDialog
      action={createSubjectAction}
      triggerLabel="New subject"
      title="Add a subject"
      description="Subjects are academic units, separate from Venture Activities. Assigning teaching faculty here does not grant venture review rights."
      submitLabel="Create subject"
      successMessage="Subject created"
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Code" htmlFor="code" required error={fieldErrors?.code}>
              <TextInput id="code" name="code" required className="font-mono" autoFocus />
            </Field>
            <Field label="Term" htmlFor="termId" required error={fieldErrors?.termId}>
              <Select id="termId" name="termId" required defaultValue="">
                <option value="" disabled>
                  Select a term
                </option>
                {terms.map((term) => (
                  <option key={term._id} value={term._id}>
                    {term.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Credits" htmlFor="credits">
              <TextInput id="credits" name="credits" type="number" min={0} defaultValue={3} />
            </Field>
            <Field label="Area" htmlFor="area">
              <TextInput id="area" name="area" />
            </Field>
          </div>

          <Field label="Name" htmlFor="name" required error={fieldErrors?.name}>
            <TextInput id="name" name="name" required />
          </Field>

          <Field label="Description" htmlFor="description">
            <TextArea id="description" name="description" rows={2} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
