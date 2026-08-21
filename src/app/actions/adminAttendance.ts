'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { clearAttendanceSchema, saveAttendanceSchema } from '@/validators/attendance';
import { clearAttendance, saveAttendance } from '@/services/ventures/attendanceService';
import type { AttendanceMark } from '@/lib/constants/status';

/**
 * Venture Activity attendance.
 *
 * Its own action module, because attendance is its own screen. Both writes
 * re-check the caller is an administrator: the middleware redirect and the
 * layout's role gate are conveniences, and neither is on the path a form POST
 * actually takes. `requireAdmin` also supplies the identity recorded as
 * `markedBy`, so a register can never be filed anonymously.
 */

const REGISTER_PATH = '/admin/attendance';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/**
 * Saves a whole register in one submit.
 *
 * The form posts one `status:<studentVentureId>` field per marked student, plus
 * an optional `remarks:<studentVentureId>`. Students left unmarked simply have
 * no field, which is what keeps "not marked" distinct from "absent".
 *
 * A `clear:<studentVentureId>` field says the opposite of a status: this student
 * had a mark and is being returned to unmarked. It has to be stated, because an
 * omitted field means "unchanged" — silence cannot also mean "delete".
 */
export async function saveAttendanceAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ date: string; marked: number; cleared: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const entries = [...formData.entries()]
      .filter(([key]) => key.startsWith('status:'))
      .map(([key, status]) => {
        const studentVentureId = key.slice('status:'.length);
        return {
          studentVentureId,
          status: typeof status === 'string' ? (status as AttendanceMark) : undefined,
          remarks: value(formData, `remarks:${studentVentureId}`) ?? '',
        };
      });

    const cleared = [...formData.keys()]
      .filter((key) => key.startsWith('clear:'))
      .map((key) => key.slice('clear:'.length));

    const input = saveAttendanceSchema.parse({
      ventureActivityId: value(formData, 'ventureActivityId'),
      date: value(formData, 'date'),
      entries,
      cleared,
    });

    const result = await saveAttendance({
      ventureActivityId: input.ventureActivityId,
      date: input.date,
      entries: input.entries,
      cleared: input.cleared,
      markedBy: admin.userId,
    });

    revalidatePath(REGISTER_PATH);
    revalidatePath('/admin/reports');
    return result;
  });
}

/** Removes one mark, returning that student to unmarked for the date. */
export async function clearAttendanceAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ cleared: number }>> {
  return runAction(async () => {
    await requireAdmin();

    const input = clearAttendanceSchema.parse({
      ventureActivityId: value(formData, 'ventureActivityId'),
      studentVentureId: value(formData, 'studentVentureId'),
      date: value(formData, 'date'),
    });

    const result = await clearAttendance(input);

    revalidatePath(REGISTER_PATH);
    return result;
  });
}
