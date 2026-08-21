'use client';

import { SquarePen } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { RecordDialog } from './RecordDialog';
import { updateUserAction } from '@/app/actions/adminUsers';
import { USER_STATUSES, type Role } from '@/lib/constants/roles';
import { humanise } from '@/lib/utils/humanise';

/** Everything an administrator may change about an account. */
export interface EditableUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  /** Role profile fields, already flattened to strings. */
  profile: Record<string, string>;
}

/**
 * Editing an account and its role profile.
 *
 * One dialog for all three roles, showing only the fields that role actually
 * has — a mentor has no roll number, and rendering a hidden empty one would
 * submit a blank that erases somebody's data.
 *
 * The email is deliberately read-only. It is the login identity: a one-time
 * code is sent to it, so changing it here would silently move an account to a
 * different person's inbox. Deactivate and re-create if an address really has
 * to change.
 */
export function EditUserForm({ user, role }: { user: EditableUser; role: Exclude<Role, 'ADMIN'> }) {
  return (
    <RecordDialog
      action={updateUserAction}
      triggerLabel="Edit"
      triggerIcon={SquarePen}
      triggerVariant="ghost"
      title={`Edit ${user.name}`}
      description="Changes take effect immediately. The email address cannot be changed here — it is how this person signs in."
      submitLabel="Save changes"
      successMessage="Account updated"
    >
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="userId" value={user._id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required error={fieldErrors?.name}>
              <TextInput id="name" name="name" required defaultValue={user.name} autoFocus />
            </Field>

            <Field label="Email" htmlFor="email" hint="Sign-in identity — not editable.">
              <TextInput id="email" defaultValue={user.email} disabled readOnly />
            </Field>

            <Field label="Phone" htmlFor="phone" error={fieldErrors?.phone}>
              <TextInput id="phone" name="phone" defaultValue={user.phone} />
            </Field>

            <Field label="Account status" htmlFor="status" error={fieldErrors?.status}>
              <Select id="status" name="status" defaultValue={user.status}>
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {humanise(status)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {role === 'STUDENT' ? (
            <StudentFields profile={user.profile} fieldErrors={fieldErrors} />
          ) : null}
          {role === 'FACULTY' ? (
            <FacultyFields profile={user.profile} fieldErrors={fieldErrors} />
          ) : null}
          {role === 'MENTOR' ? (
            <MentorFields profile={user.profile} fieldErrors={fieldErrors} />
          ) : null}
        </>
      )}
    </RecordDialog>
  );
}

type FieldErrors = Record<string, string> | undefined;

function StudentFields({
  profile,
  fieldErrors,
}: {
  profile: Record<string, string>;
  fieldErrors: FieldErrors;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Roll number" htmlFor="rollNumber" required error={fieldErrors?.rollNumber}>
          <TextInput
            id="rollNumber"
            name="rollNumber"
            required
            className="font-mono"
            defaultValue={profile.rollNumber ?? ''}
          />
        </Field>
        <Field label="Batch" htmlFor="batch" required error={fieldErrors?.batch}>
          <TextInput id="batch" name="batch" required defaultValue={profile.batch ?? ''} />
        </Field>
        <Field label="Cluster" htmlFor="cluster" error={fieldErrors?.cluster}>
          <TextInput id="cluster" name="cluster" defaultValue={profile.cluster ?? ''} />
        </Field>
      </div>

      <Field label="Background" htmlFor="background" error={fieldErrors?.background}>
        <TextArea
          id="background"
          name="background"
          rows={2}
          defaultValue={profile.background ?? ''}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Strengths" htmlFor="strengths" error={fieldErrors?.strengths}>
          <TextArea
            id="strengths"
            name="strengths"
            rows={2}
            defaultValue={profile.strengths ?? ''}
          />
        </Field>
        <Field label="Areas to develop" htmlFor="weakness" error={fieldErrors?.weakness}>
          <TextArea id="weakness" name="weakness" rows={2} defaultValue={profile.weakness ?? ''} />
        </Field>
      </div>

      <Field
        label="Personal context"
        htmlFor="personalContext"
        hint="Anything the programme office should keep in mind."
        error={fieldErrors?.personalContext}
      >
        <TextArea
          id="personalContext"
          name="personalContext"
          rows={2}
          defaultValue={profile.personalContext ?? ''}
        />
      </Field>
    </>
  );
}

function FacultyFields({
  profile,
  fieldErrors,
}: {
  profile: Record<string, string>;
  fieldErrors: FieldErrors;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Designation" htmlFor="designation" error={fieldErrors?.designation}>
          <TextInput id="designation" name="designation" defaultValue={profile.designation ?? ''} />
        </Field>
        <Field label="Department" htmlFor="department" error={fieldErrors?.department}>
          <TextInput id="department" name="department" defaultValue={profile.department ?? ''} />
        </Field>
        <Field label="Specialization" htmlFor="specialization" error={fieldErrors?.specialization}>
          <TextInput
            id="specialization"
            name="specialization"
            defaultValue={profile.specialization ?? ''}
          />
        </Field>
      </div>

      <Field label="Bio" htmlFor="bio" error={fieldErrors?.bio}>
        <TextArea id="bio" name="bio" rows={3} defaultValue={profile.bio ?? ''} />
      </Field>
    </>
  );
}

function MentorFields({
  profile,
  fieldErrors,
}: {
  profile: Record<string, string>;
  fieldErrors: FieldErrors;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="company" error={fieldErrors?.company}>
          <TextInput id="company" name="company" defaultValue={profile.company ?? ''} />
        </Field>
        <Field label="Designation" htmlFor="designation" error={fieldErrors?.designation}>
          <TextInput id="designation" name="designation" defaultValue={profile.designation ?? ''} />
        </Field>
        <Field label="Industry" htmlFor="industry" error={fieldErrors?.industry}>
          <TextInput id="industry" name="industry" defaultValue={profile.industry ?? ''} />
        </Field>
        <Field label="Expertise" htmlFor="expertise" error={fieldErrors?.expertise}>
          <TextInput id="expertise" name="expertise" defaultValue={profile.expertise ?? ''} />
        </Field>
      </div>

      <Field label="Bio" htmlFor="bio" error={fieldErrors?.bio}>
        <TextArea id="bio" name="bio" rows={3} defaultValue={profile.bio ?? ''} />
      </Field>
    </>
  );
}
