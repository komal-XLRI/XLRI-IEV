'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { upsertSupportActivityAction } from '@/app/actions/adminVentures';
import { SUPPORT_SCHEDULE_TYPES } from '@/lib/constants/status';
import { humanise } from '@/lib/utils/humanise';
import { toDateInputValue } from '@/lib/utils/dates';

interface SupportActivityView {
  _id: string;
  activityCode: string;
  name: string;
  description?: string;
  order: number;
  scheduleType: string;
  /** Serialised to an ISO string before it crosses the RSC boundary. */
  scheduledDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * The fields, shared by the create dialog and the inline edit form.
 *
 * Ids are suffixed with the record id so several of these can sit on one page —
 * the support-activities screen renders an editor per activity — without two
 * labels pointing at the same control.
 */
function Fields({
  fieldErrors,
  existing,
}: {
  fieldErrors?: Record<string, string>;
  existing?: SupportActivityView;
}) {
  const suffix = existing?._id ?? 'new';

  // Tracked only so the schedule hint can say the right thing; the value still
  // posts from the select itself.
  const [scheduleType, setScheduleType] = useState(existing?.scheduleType ?? 'INDEPENDENT');

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Code"
          htmlFor={`code-${suffix}`}
          required
          hint={existing ? undefined : 'Unique. Reusing a code updates that record.'}
        >
          <TextInput
            id={`code-${suffix}`}
            name="activityCode"
            required
            readOnly={Boolean(existing)}
            defaultValue={existing?.activityCode}
            className="font-mono"
            placeholder="A9"
          />
        </Field>

        <Field label="Order" htmlFor={`order-${suffix}`} required error={fieldErrors?.order}>
          <TextInput
            id={`order-${suffix}`}
            name="order"
            type="number"
            min={1}
            required
            defaultValue={existing?.order}
          />
        </Field>
      </div>

      <Field label="Name" htmlFor={`name-${suffix}`} required error={fieldErrors?.name}>
        <TextInput id={`name-${suffix}`} name="name" required defaultValue={existing?.name} />
      </Field>

      <Field
        label="Schedule type"
        htmlFor={`type-${suffix}`}
        required
        hint="Academic session activities are timetabled as classes."
      >
        <Select
          id={`type-${suffix}`}
          name="scheduleType"
          required
          value={scheduleType}
          onChange={(event) => setScheduleType(event.target.value)}
        >
          {SUPPORT_SCHEDULE_TYPES.map((type) => (
            <option key={type} value={type}>
              {humanise(type) ?? type}
            </option>
          ))}
        </Select>
      </Field>

      {/* Optional, and deliberately so. An academic-session activity is
          timetabled as a class, where the date and time already live — filling
          these in as well would be a second answer nothing keeps in step. */}
      <fieldset className="border-border rounded-card border p-3">
        <legend className="type-overline px-1.5">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3" aria-hidden="true" />
            Schedule
          </span>
        </legend>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor={`date-${suffix}`} error={fieldErrors?.scheduledDate}>
            <TextInput
              id={`date-${suffix}`}
              name="scheduledDate"
              type="date"
              defaultValue={toDateInputValue(existing?.scheduledDate)}
            />
          </Field>

          <Field label="Start time" htmlFor={`start-${suffix}`} error={fieldErrors?.startTime}>
            <TextInput
              id={`start-${suffix}`}
              name="startTime"
              type="time"
              defaultValue={existing?.startTime ?? ''}
            />
          </Field>

          <Field label="End time" htmlFor={`end-${suffix}`} error={fieldErrors?.endTime}>
            <TextInput
              id={`end-${suffix}`}
              name="endTime"
              type="time"
              defaultValue={existing?.endTime ?? ''}
            />
          </Field>
        </div>

        <p className="type-caption mt-2">
          {scheduleType === 'ACADEMIC_SESSION'
            ? 'This activity is timetabled as a class — set its real date and time under Academic → Classes. Anything here is only a note.'
            : 'Optional. Leave blank if this activity has no fixed date.'}
        </p>
      </fieldset>

      <Field label="Description" htmlFor={`desc-${suffix}`}>
        <TextArea
          id={`desc-${suffix}`}
          name="description"
          rows={2}
          defaultValue={existing?.description}
        />
      </Field>
    </div>
  );
}

/** Upsert keyed on `activityCode`, so the same action creates and edits. */
export function SupportActivityForm({
  existing,
  compact,
}: {
  existing?: SupportActivityView;
  compact?: boolean;
}) {
  // Editing happens in place, next to the record it changes; creating happens in
  // a dialog, because there is no record to sit beside yet.
  if (compact) {
    return (
      <ActionForm action={upsertSupportActivityAction} successMessage="Saved.">
        {({ fieldErrors }) => (
          <div className="space-y-3">
            <Fields fieldErrors={fieldErrors} existing={existing} />
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </div>
        )}
      </ActionForm>
    );
  }

  return (
    <RecordDialog
      action={upsertSupportActivityAction}
      triggerLabel="New support activity"
      title="Add a support activity"
      description="Codes are unique — submitting an existing code updates that record rather than creating a second one."
      submitLabel="Save support activity"
      successMessage="Support activity saved"
      size="md"
    >
      {({ fieldErrors }) => <Fields fieldErrors={fieldErrors} />}
    </RecordDialog>
  );
}
