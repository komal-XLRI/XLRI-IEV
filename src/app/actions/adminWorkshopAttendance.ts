'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import {
  matchAttendeesSchema,
  saveWorkshopAttendanceSchema,
} from '@/validators/workshopAttendance';
import {
  matchWorkshopAttendees,
  saveWorkshopAttendance,
  type AttendeeMatch,
} from '@/services/workshops/workshopAttendanceService';
import type { AttendanceMark } from '@/lib/constants/status';

/**
 * Workshop attendance.
 *
 * Both entry points re-check the caller is an administrator: the middleware
 * redirect and the layout's role gate are conveniences, and neither is on the
 * path a form POST actually takes. `requireAdmin` also supplies the identity
 * recorded as `markedBy`, so a register can never be filed anonymously.
 */

const REGISTER_PATH = '/admin/academic/workshops';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/**
 * Saves a whole workshop register in one submit.
 *
 * `status:<studentId>` marks somebody, `clear:<studentId>` takes a mark back
 * off, and a student named by neither is left exactly as they were — which is
 * what keeps "not marked" distinct from "absent".
 */
export async function saveWorkshopAttendanceAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ marked: number; cleared: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const entries = [...formData.entries()]
      .filter(([key]) => key.startsWith('status:'))
      .map(([key, status]) => {
        const studentId = key.slice('status:'.length);
        return {
          studentId,
          status: typeof status === 'string' ? (status as AttendanceMark) : undefined,
          remarks: value(formData, `remarks:${studentId}`) ?? '',
        };
      });

    const cleared = [...formData.keys()]
      .filter((key) => key.startsWith('clear:'))
      .map((key) => key.slice('clear:'.length));

    const input = saveWorkshopAttendanceSchema.parse({
      workshopId: value(formData, 'workshopId'),
      entries,
      cleared,
    });

    const result = await saveWorkshopAttendance({
      workshopId: input.workshopId,
      entries: input.entries,
      cleared: input.cleared,
      markedBy: admin.userId,
    });

    revalidatePath(REGISTER_PATH);
    revalidatePath('/admin/reports');
    return result;
  });
}

/**
 * Resolves a pasted attendee list to students.
 *
 * Writes nothing. The dialog pre-selects what came back and the administrator
 * saves, so a paste that matched the wrong people is reviewable first.
 */
export async function matchAttendeesAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<AttendeeMatch>> {
  return runAction(async () => {
    await requireAdmin();

    const input = matchAttendeesSchema.parse({ text: value(formData, 'text') });
    return matchWorkshopAttendees(input.text);
  });
}
