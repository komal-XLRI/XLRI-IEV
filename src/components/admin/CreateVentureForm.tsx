'use client';

import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { RecordDialog } from './RecordDialog';
import { createStudentVentureAction } from '@/app/actions/adminVentures';

export interface PersonOption {
  _id: string;
  name: string;
  email: string;
}

export function CreateVentureForm({
  students,
  faculty,
  mentors,
}: {
  students: PersonOption[];
  faculty: PersonOption[];
  mentors: PersonOption[];
}) {
  return (
    <RecordDialog
      action={createStudentVentureAction}
      triggerLabel="New venture"
      title="Create a venture"
      description="This also generates the student's Venture Activity and Support Activity progress records."
      submitLabel="Create venture"
      successMessage="Venture created with its activity records"
    >
      {({ fieldErrors }) => (
        <>
          {students.length === 0 ? (
            <FormMessage tone="info">
              Every active student already has a venture. Add a student first.
            </FormMessage>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Student" htmlFor="studentId" required error={fieldErrors?.studentId}>
              <Select id="studentId" name="studentId" required defaultValue="" autoFocus>
                <option value="" disabled>
                  Select a student
                </option>
                {students.map((student) => (
                  <option key={student._id} value={student._id}>
                    {student.name} — {student.email}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Faculty reviewer"
              htmlFor="facultyId"
              hint="Approval is mandatory for every activity."
            >
              <Select id="facultyId" name="facultyId" defaultValue="">
                <option value="">Assign later</option>
                {faculty.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Mentor reviewer"
              htmlFor="mentorId"
              hint="Approval is mandatory for every activity."
            >
              <Select id="mentorId" name="mentorId" defaultValue="">
                <option value="">Assign later</option>
                {mentors.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Venture name"
              htmlFor="ventureName"
              required
              error={fieldErrors?.ventureName}
            >
              <TextInput id="ventureName" name="ventureName" required />
            </Field>
            <Field label="Tagline" htmlFor="ventureTitle">
              <TextInput id="ventureTitle" name="ventureTitle" />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <TextInput id="industry" name="industry" />
            </Field>
            <Field label="Target market" htmlFor="targetMarket">
              <TextInput id="targetMarket" name="targetMarket" />
            </Field>
          </div>

          <Field label="Problem statement" htmlFor="problemStatement">
            <TextArea id="problemStatement" name="problemStatement" rows={2} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
