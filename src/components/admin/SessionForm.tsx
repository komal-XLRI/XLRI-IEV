'use client';

import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { RecordDialog } from './RecordDialog';
import { createSessionAction } from '@/app/actions/adminAcademic';
import { EXPERT_WORKSHOP_CODE } from '@/lib/constants/activities';
import { SESSION_TYPES } from '@/lib/constants/status';
import { humanise } from '@/lib/utils/humanise';

interface SubjectOption {
  _id: string;
  code: string;
  name: string;
}

interface PersonOption {
  _id: string;
  name: string;
  email: string;
}

interface SupportOption {
  _id: string;
  activityCode: string;
  name: string;
}

export function SessionForm({
  subjects,
  faculty,
  supportActivities,
}: {
  subjects: SubjectOption[];
  faculty: PersonOption[];
  supportActivities: SupportOption[];
}) {
  // Linking a class to this support activity is what schedules an Expert
  // Workshop; there is no separate workshop record.
  const workshop = supportActivities.find(
    (support) => support.activityCode === EXPERT_WORKSHOP_CODE,
  );

  return (
    <RecordDialog
      action={createSessionAction}
      triggerLabel="Schedule class"
      title="Schedule a class"
      description="Link a class to a support activity to schedule an Expert Workshop."
      submitLabel="Schedule class"
      successMessage="Class scheduled"
    >
      {({ fieldErrors }) => (
        <>
          {subjects.length === 0 || faculty.length === 0 ? (
            <FormMessage tone="info">
              Add at least one subject and one faculty account before scheduling classes.
            </FormMessage>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject" htmlFor="subjectId" required error={fieldErrors?.subjectId}>
              <Select id="subjectId" name="subjectId" required defaultValue="" autoFocus>
                <option value="" disabled>
                  Select a subject
                </option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.code} — {subject.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Faculty" htmlFor="facultyId" required error={fieldErrors?.facultyId}>
              <Select id="facultyId" name="facultyId" required defaultValue="">
                <option value="" disabled>
                  Select faculty
                </option>
                {faculty.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" htmlFor="date" required error={fieldErrors?.date}>
              <TextInput id="date" name="date" type="date" required />
            </Field>
            <Field label="Start" htmlFor="startTime" required error={fieldErrors?.startTime}>
              <TextInput id="startTime" name="startTime" type="time" required />
            </Field>
            <Field label="End" htmlFor="endTime" required error={fieldErrors?.endTime}>
              <TextInput id="endTime" name="endTime" type="time" required />
            </Field>
            <Field label="Type" htmlFor="sessionType">
              <Select id="sessionType" name="sessionType" defaultValue="LECTURE">
                {SESSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanise(type) ?? type}
                  </option>
                ))}
              </Select>
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
            >
              <Select id="supportActivityId" name="supportActivityId" defaultValue="">
                <option value="">None</option>
                {supportActivities.map((support) => (
                  <option key={support._id} value={support._id}>
                    {support.activityCode} — {support.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Topic" htmlFor="topic">
              <TextInput id="topic" name="topic" />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <TextArea id="notes" name="notes" rows={2} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
