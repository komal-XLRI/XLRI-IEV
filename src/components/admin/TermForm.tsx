'use client';

import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { upsertTermAction } from '@/app/actions/adminAcademic';
import { TERM_STATUSES } from '@/lib/constants/status';
import { toDateInputValue } from '@/lib/utils/dates';

interface TermView {
  _id: string;
  termNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export function TermForm({
  termNumber,
  existing,
  fallbackName,
}: {
  termNumber: number;
  existing: TermView | null;
  fallbackName: string;
}) {
  return (
    <div className="surface-sunken rounded-lg p-4">
      <ActionForm action={upsertTermAction} successMessage="Saved.">
        {({ fieldErrors }) => (
          <div className="space-y-3">
            <input type="hidden" name="termNumber" value={termNumber} />

            <Field
              label="Name"
              htmlFor={`term-name-${termNumber}`}
              required
              error={fieldErrors?.name}
            >
              <TextInput
                id={`term-name-${termNumber}`}
                name="name"
                required
                defaultValue={existing?.name ?? fallbackName}
              />
            </Field>

            <Field
              label="Start date"
              htmlFor={`term-start-${termNumber}`}
              required
              error={fieldErrors?.startDate}
            >
              <TextInput
                id={`term-start-${termNumber}`}
                name="startDate"
                type="date"
                required
                defaultValue={toDateInputValue(existing?.startDate)}
              />
            </Field>

            <Field
              label="End date"
              htmlFor={`term-end-${termNumber}`}
              required
              error={fieldErrors?.endDate}
            >
              <TextInput
                id={`term-end-${termNumber}`}
                name="endDate"
                type="date"
                required
                defaultValue={toDateInputValue(existing?.endDate)}
              />
            </Field>

            <Field label="Status" htmlFor={`term-status-${termNumber}`}>
              <Select
                id={`term-status-${termNumber}`}
                name="status"
                defaultValue={existing?.status ?? 'UPCOMING'}
              >
                {TERM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <SubmitButton size="sm" pendingLabel="Saving…">
              {existing ? 'Save term' : 'Create term'}
            </SubmitButton>
          </div>
        )}
      </ActionForm>
    </div>
  );
}
