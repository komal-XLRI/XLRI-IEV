'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import {
  studentVentureDetailsSchema,
  updateStudentSupportActivitySchema,
} from '@/validators/ventures';
import { objectId } from '@/validators/common';
import {
  getVentureByStudentId,
  updateStudentVenture,
} from '@/services/ventures/studentVentureService';
import { updateStudentSupportActivity } from '@/services/support/supportService';
import { NotFoundError } from '@/lib/errors';
import { serialize } from '@/lib/utils/serialize';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/** A student may edit their own venture narrative, never its reviewers. */
export async function updateMyVentureAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const user = await requireRole('STUDENT');

    const venture = await getVentureByStudentId(user.userId);
    if (!venture) throw new NotFoundError('You do not have a venture yet');

    const input = studentVentureDetailsSchema.parse({
      ventureName: value(formData, 'ventureName'),
      ventureTitle: value(formData, 'ventureTitle'),
      industry: value(formData, 'industry'),
      targetMarket: value(formData, 'targetMarket'),
      problemStatement: value(formData, 'problemStatement'),
      solution: value(formData, 'solution'),
      fundingStatus: value(formData, 'fundingStatus'),
    });

    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const updated = await updateStudentVenture(venture._id.toString(), clean);

    revalidatePath('/student/venture');
    revalidatePath('/student');
    return serialize(updated);
  });
}

export async function updateSupportActivityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireRole('STUDENT', 'FACULTY', 'MENTOR', 'ADMIN');

    const recordId = objectId.parse(value(formData, 'recordId'));
    const input = updateStudentSupportActivitySchema.parse({
      status: value(formData, 'status'),
      notes: value(formData, 'notes'),
    });

    const updated = await updateStudentSupportActivity(recordId, input, {
      userId: actor.userId,
      role: actor.role,
    });

    revalidatePath('/student/support');
    revalidatePath('/faculty');
    revalidatePath('/mentor');
    return serialize(updated);
  });
}
