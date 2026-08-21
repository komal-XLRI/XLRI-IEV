'use client';

import { SquarePen } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { updateSessionAction } from '@/app/actions/adminAcademic';
import { EXPERT_WORKSHOP_CODE } from '@/lib/constants/activities';
import { SESSION_TYPES } from '@/lib/constants/status';
import { humanise } from '@/lib/utils/humanise';

export interface EditableSession {
  _id: string;
  /** Shown, not edited — see the note in the dialog. */
  subjectLabel: string;
  facultyId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  supportActivityId: string;
  topic: string;
  notes: string;
}

/**
 * Editing a scheduled class.
 *
 * The subject is fixed. A class belongs to a subject the way a chapter belongs
 * to a book — moving one somewhere else is not an edit, it is deleting a class
 * and scheduling another, and doing it silently would leave attendance and
 * support-activity links pointing at a class that is no longer the same thing.
 */
export function EditSessionForm({
  session,
  faculty,
  supportActivities,
}: {
  session: EditableSession;
  faculty: Array<{ _id: string; name: string }>;
  supportActivities: Array<{ _id: string; activityCode: string; name: string }>;
}) {
  const workshop = supportActivities.find(
    (support) => support.activityCode === EXPERT_WORKSHOP_CODE,
  );

  return (
    <RecordDialog
      action={updateSessionAction}
      triggerLabel="Edit"
      triggerIcon={SquarePen}
      triggerVariant="ghost"
      title="Edit class"
      description={`${session.subjectLabel} — the subject cannot be changed here.`}
      submitLabel="Save changes"
      successMessage="Class updated"
    >
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="sessionId" value={session._id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Faculty" htmlFor="facultyId" required error={fieldErrors?.facultyId}>
              <Select id="facultyId" name="facultyId" required defaultValue={session.facultyId}>
                {faculty.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Type" htmlFor="sessionType" error={fieldErrors?.sessionType}>
              <Select id="sessionType" name="sessionType" defaultValue={session.sessionType}>
                {SESSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanise(type) ?? type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="date" required error={fieldErrors?.date}>
              <TextInput
                id="date"
                name="date"
                type="date"
                required
                defaultValue={session.date}
                autoFocus
              />
            </Field>
            <Field label="Start" htmlFor="startTime" required error={fieldErrors?.startTime}>
              <TextInput
                id="startTime"
                name="startTime"
                type="time"
                required
                defaultValue={session.startTime}
              />
            </Field>
            <Field label="End" htmlFor="endTime" required error={fieldErrors?.endTime}>
              <TextInput
                id="endTime"
                name="endTime"
                type="time"
                required
                defaultValue={session.endTime}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Support activity"
              htmlFor="supportActivityId"
              hint={
                workshop
                  ? `Choose ${workshop.activityCode} to schedule an Expert Workshop.`
                  : 'Optional link to a support activity.'
              }
              error={fieldErrors?.supportActivityId}
            >
              <Select
                id="supportActivityId"
                name="supportActivityId"
                defaultValue={session.supportActivityId}
              >
                <option value="">None</option>
                {supportActivities.map((support) => (
                  <option key={support._id} value={support._id}>
                    {support.activityCode} — {support.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Topic" htmlFor="topic" error={fieldErrors?.topic}>
              <TextInput id="topic" name="topic" defaultValue={session.topic} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" error={fieldErrors?.notes}>
            <TextArea id="notes" name="notes" rows={3} defaultValue={session.notes} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
