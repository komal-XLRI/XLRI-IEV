'use client';

import { ActionForm } from '@/components/forms/ActionForm';
import { SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { assignReviewersAction } from '@/app/actions/adminVentures';
import type { PersonOption } from './CreateVentureForm';

/**
 * Only Admin can reach this. Reassignment updates the current assignment; the
 * reviewer snapshot on already-reviewed activities is preserved, so history
 * still names whoever actually gave the verdict.
 */
export function AssignReviewersForm({
  studentVentureId,
  currentFacultyId,
  currentMentorId,
  faculty,
  mentors,
}: {
  studentVentureId: string;
  currentFacultyId: string;
  currentMentorId: string;
  faculty: PersonOption[];
  mentors: PersonOption[];
}) {
  return (
    <Card>
      <CardHeader
        title="Review assignment"
        description="Both approvals are mandatory, so a venture with an unassigned reviewer cannot complete any activity."
      />
      <CardBody>
        <ActionForm action={assignReviewersAction} successMessage="Assignment updated.">
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="studentVentureId" value={studentVentureId} />

              <Field label="Faculty reviewer" htmlFor="facultyId" error={fieldErrors?.facultyId}>
                <Select id="facultyId" name="facultyId" defaultValue={currentFacultyId}>
                  <option value="">Not assigned</option>
                  {faculty.map((person) => (
                    <option key={person._id} value={person._id}>
                      {person.name} — {person.email}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Mentor reviewer" htmlFor="mentorId" error={fieldErrors?.mentorId}>
                <Select id="mentorId" name="mentorId" defaultValue={currentMentorId}>
                  <option value="">Not assigned</option>
                  {mentors.map((person) => (
                    <option key={person._id} value={person._id}>
                      {person.name} — {person.email}
                    </option>
                  ))}
                </Select>
              </Field>

              <SubmitButton pendingLabel="Saving…">Save assignment</SubmitButton>
            </div>
          )}
        </ActionForm>
      </CardBody>
    </Card>
  );
}
