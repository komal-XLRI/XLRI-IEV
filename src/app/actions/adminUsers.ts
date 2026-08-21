'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { createUserSchema, importStudentsSchema, updateUserSchema } from '@/validators/users';
import { objectId } from '@/validators/common';
import {
  createUser,
  importStudents,
  setUserStatus,
  updateUser,
  type ImportOutcome,
} from '@/services/users/userService';
import { USER_STATUSES } from '@/lib/constants/roles';
import { z } from 'zod';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

export async function createUserAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    await requireAdmin();

    const role = formValue(formData, 'role');

    const raw = {
      role,
      name: formValue(formData, 'name'),
      email: formValue(formData, 'email'),
      phone: formValue(formData, 'phone'),
      status: formValue(formData, 'status') ?? 'ACTIVE',
      profile: {
        rollNumber: formValue(formData, 'rollNumber'),
        batch: formValue(formData, 'batch'),
        cluster: formValue(formData, 'cluster'),
        background: formValue(formData, 'background'),
        strengths: formValue(formData, 'strengths'),
        weakness: formValue(formData, 'weakness'),
        personalContext: formValue(formData, 'personalContext'),
        designation: formValue(formData, 'designation'),
        department: formValue(formData, 'department'),
        specialization: formValue(formData, 'specialization'),
        company: formValue(formData, 'company'),
        industry: formValue(formData, 'industry'),
        expertise: formValue(formData, 'expertise'),
        bio: formValue(formData, 'bio'),
      },
    };

    const input = createUserSchema.parse(raw);
    const result = await createUser(input);

    revalidatePath('/admin/users');
    revalidatePath('/admin/students');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/mentors');

    return result;
  });
}

/** The raw value of a field that was on the form; undefined if it was not. */
function submitted(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw.trim() : undefined;
}

export async function updateUserAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    await requireAdmin();

    const userId = objectId.parse(formValue(formData, 'userId'));

    // `submitted` keeps an empty field as '' rather than folding it to
    // undefined: on an edit form those mean opposite things — "clear this" and
    // "this field was not on the form" — and only a field that was actually
    // shown should ever be changed. That is what lets one dialog serve three
    // roles without a mentor's blank fields wiping a student's.
    const input = updateUserSchema.parse({
      name: submitted(formData, 'name'),
      phone: submitted(formData, 'phone'),
      // An enum has no empty member, so this one still folds to undefined.
      status: formValue(formData, 'status'),
      profile: {
        rollNumber: submitted(formData, 'rollNumber'),
        batch: submitted(formData, 'batch'),
        cluster: submitted(formData, 'cluster'),
        background: submitted(formData, 'background'),
        strengths: submitted(formData, 'strengths'),
        weakness: submitted(formData, 'weakness'),
        personalContext: submitted(formData, 'personalContext'),
        designation: submitted(formData, 'designation'),
        department: submitted(formData, 'department'),
        specialization: submitted(formData, 'specialization'),
        company: submitted(formData, 'company'),
        industry: submitted(formData, 'industry'),
        expertise: submitted(formData, 'expertise'),
        bio: submitted(formData, 'bio'),
      },
    });

    const result = await updateUser(userId, input);

    revalidatePath('/admin/students');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/mentors');
    revalidatePath(`/admin/users/${userId}`);

    return result;
  });
}

export async function setUserStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ userId: string; status: string }>> {
  return runAction(async () => {
    await requireAdmin();

    const userId = objectId.parse(formValue(formData, 'userId'));
    const status = z.enum(USER_STATUSES).parse(formValue(formData, 'status'));

    const result = await setUserStatus(userId, status);

    revalidatePath('/admin/students');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/mentors');

    return result;
  });
}

/**
 * Bulk import from pasted CSV: name,email,rollNumber,batch[,cluster,phone].
 * Rows that fail are reported rather than aborting the whole import.
 */
export async function importStudentsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<ImportOutcome>> {
  return runAction(async () => {
    await requireAdmin();

    const csv = formValue(formData, 'csv') ?? '';
    const rows = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line, index) => !(index === 0 && /name\s*,\s*email/i.test(line)));

    const students = rows.map((line) => {
      const [name, email, rollNumber, batch, cluster, phone] = line
        .split(',')
        .map((cell) => cell.trim());
      return { name, email, rollNumber, batch, cluster, phone };
    });

    const input = importStudentsSchema.parse({ students });
    const outcome = await importStudents(input);

    revalidatePath('/admin/students');
    return outcome;
  });
}
