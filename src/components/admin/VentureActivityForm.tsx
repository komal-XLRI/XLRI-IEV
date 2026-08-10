'use client';

import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { createVentureActivityAction } from '@/app/actions/adminVentures';
import { DEFAULT_MAX_ATTEMPTS } from '@/lib/constants/activities';

export interface TermOption {
  _id: string;
  name: string;
  termNumber: number;
}

export function VentureActivityForm({ terms }: { terms: TermOption[] }) {
  return (
    <RecordDialog
      action={createVentureActivityAction}
      triggerLabel="New activity"
      title="Add a venture activity"
      description="Start and end dates drive the displayed duration; the attempt limit is enforced by the server."
      submitLabel="Create activity"
      successMessage="Activity created"
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Code" htmlFor="activityCode" required error={fieldErrors?.activityCode}>
              <TextInput
                id="activityCode"
                name="activityCode"
                required
                placeholder="V13"
                autoFocus
              />
            </Field>
            <Field label="Order" htmlFor="order" required error={fieldErrors?.order}>
              <TextInput id="order" name="order" type="number" min={1} required />
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
            <Field
              label="Max attempts"
              htmlFor="maxAttempts"
              required
              error={fieldErrors?.maxAttempts}
              hint="Per student, per activity."
            >
              <TextInput
                id="maxAttempts"
                name="maxAttempts"
                type="number"
                min={1}
                max={10}
                required
                defaultValue={DEFAULT_MAX_ATTEMPTS}
              />
            </Field>
          </div>

          <Field label="Name" htmlFor="name" required error={fieldErrors?.name}>
            <TextInput id="name" name="name" required />
          </Field>

          <Field label="Description" htmlFor="description">
            <TextArea id="description" name="description" rows={2} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="startDate" required error={fieldErrors?.startDate}>
              <TextInput id="startDate" name="startDate" type="date" required />
            </Field>
            <Field label="End date" htmlFor="endDate" required error={fieldErrors?.endDate}>
              <TextInput id="endDate" name="endDate" type="date" required />
            </Field>
          </div>

          <Checkbox name="evidenceRequired" label="Evidence required" defaultChecked />
        </>
      )}
    </RecordDialog>
  );
}
