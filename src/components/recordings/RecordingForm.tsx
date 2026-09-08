'use client';

import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionForm } from '@/components/forms/ActionForm';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { RecordDialog } from '@/components/admin/RecordDialog';
import { createRecordingAction, updateRecordingAction } from '@/app/actions/adminRecordings';
import type { RecordingRow } from './recordingTableModel';

/**
 * The form: the register's columns, in the order they are read across the row.
 *
 * Only the event and the date are required. A row is usually filed before its
 * recording exists, so demanding a recording link would mean either not filing
 * the session or filing it with a placeholder.
 */
function RecordingFields({
  values,
  fieldErrors,
}: {
  values?: RecordingRow;
  fieldErrors?: Record<string, string>;
}): ReactNode {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event" htmlFor="event" required error={fieldErrors?.event}>
          <TextInput
            id="event"
            name="event"
            required
            autoFocus
            maxLength={120}
            defaultValue={values?.event}
            placeholder="Presentation"
          />
        </Field>

        <Field label="Date" htmlFor="date" required error={fieldErrors?.date}>
          <TextInput id="date" name="date" type="date" required defaultValue={values?.date} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Timings" htmlFor="timings" error={fieldErrors?.timings}>
          <TextInput
            id="timings"
            name="timings"
            maxLength={60}
            defaultValue={values?.timings}
            placeholder="2:00 PM to 4:00 PM"
          />
        </Field>

        <Field label="Batch" htmlFor="batch" error={fieldErrors?.batch}>
          <TextInput
            id="batch"
            name="batch"
            maxLength={60}
            defaultValue={values?.batch}
            placeholder="Batch 26-28"
          />
        </Field>

        <Field label="Venue" htmlFor="venue" error={fieldErrors?.venue}>
          <TextInput
            id="venue"
            name="venue"
            maxLength={120}
            defaultValue={values?.venue}
            placeholder="Amphitheatre"
          />
        </Field>
      </div>

      <Field label="Zoom link" htmlFor="zoomLink" error={fieldErrors?.zoomLink}>
        <TextInput
          id="zoomLink"
          name="zoomLink"
          type="url"
          inputMode="url"
          maxLength={1000}
          defaultValue={values?.zoomLink}
          placeholder="https://xlri-ac-in.zoom.us/j/…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meeting ID" htmlFor="meetingId" error={fieldErrors?.meetingId}>
          <TextInput
            id="meetingId"
            name="meetingId"
            maxLength={40}
            defaultValue={values?.meetingId}
            placeholder="812 8898 6682"
          />
        </Field>

        <Field label="Passcode" htmlFor="passcode" error={fieldErrors?.passcode}>
          <TextInput
            id="passcode"
            name="passcode"
            maxLength={60}
            defaultValue={values?.passcode}
            placeholder="xlri2026"
          />
        </Field>
      </div>

      <Field
        label="Recording link"
        htmlFor="recordingLink"
        error={fieldErrors?.recordingLink}
        hint="Leave blank until the recording is ready. Keep the file itself restricted — this page only shows the link."
      >
        <TextInput
          id="recordingLink"
          name="recordingLink"
          type="url"
          inputMode="url"
          maxLength={1000}
          defaultValue={values?.recordingLink}
          placeholder="https://xlri-ac-in.zoom.us/rec/share/…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Recording passcode"
          htmlFor="recordingPasscode"
          error={fieldErrors?.recordingPasscode}
        >
          <TextInput
            id="recordingPasscode"
            name="recordingPasscode"
            maxLength={60}
            defaultValue={values?.recordingPasscode}
            placeholder="9w8?SMxK"
          />
        </Field>
      </div>
    </>
  );
}

/** "Add row" — the primary action on the recordings page. */
export function CreateRecordingForm() {
  return (
    <RecordDialog
      action={createRecordingAction}
      triggerLabel="Add row"
      title="Add a row"
      description="A session and its links. Only the event and the date are needed to file it."
      submitLabel="Add row"
      successMessage="Row added"
    >
      {({ fieldErrors }) => <RecordingFields fieldErrors={fieldErrors} />}
    </RecordDialog>
  );
}

/**
 * Edit, as a dialog opened from the row.
 *
 * Not a RecordDialog: that component owns its own trigger and always draws a
 * "New …" primary button, which is the wrong affordance in a table row.
 */
export function EditRecordingForm({ recording }: { recording: RecordingRow }) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${recording.event} on ${recording.date}`}
        className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center transition-colors"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Edit row"
        description={`${recording.event} · ${recording.date}`}
      >
        <ActionForm
          action={updateRecordingAction}
          onSuccess={() => {
            setOpen(false);
            notify({ tone: 'success', title: 'Row updated' });
          }}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="recordingId" value={recording._id} />

              <RecordingFields values={recording} fieldErrors={fieldErrors} />

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      </Modal>
    </>
  );
}
