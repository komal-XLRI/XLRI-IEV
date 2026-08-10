'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRole } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import {
  assignSubjectFacultySchema,
  createSubjectSchema,
  createSubjectSessionSchema,
  markAttendanceSchema,
  updateSubjectSchema,
  updateSubjectSessionSchema,
  upsertTermSchema,
} from '@/validators/academic';
import { objectId } from '@/validators/common';
import {
  createSubject,
  createSubjectSession,
  deleteSubject,
  deleteSubjectSession,
  markAttendance,
  setSubjectFaculty,
  updateSubject,
  updateSubjectSession,
  upsertTerm,
} from '@/services/academic/academicService';
import { serialize } from '@/lib/utils/serialize';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

// ---------------------------------------------------------------- Terms ----

export async function upsertTermAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = upsertTermSchema.parse({
      termNumber: value(formData, 'termNumber'),
      name: value(formData, 'name'),
      startDate: value(formData, 'startDate'),
      endDate: value(formData, 'endDate'),
      status: value(formData, 'status') ?? 'UPCOMING',
    });

    const term = await upsertTerm(input);
    revalidatePath('/admin/academic/terms');
    return serialize(term);
  });
}

// ------------------------------------------------------------- Subjects ----

export async function createSubjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = createSubjectSchema.parse({
      code: value(formData, 'code'),
      name: value(formData, 'name'),
      credits: value(formData, 'credits') ?? 3,
      area: value(formData, 'area'),
      termId: value(formData, 'termId'),
      description: value(formData, 'description'),
      status: value(formData, 'status') ?? 'ACTIVE',
    });

    const subject = await createSubject(input);
    revalidatePath('/admin/academic/subjects');
    return serialize(subject);
  });
}

export async function updateSubjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const subjectId = objectId.parse(value(formData, 'subjectId'));
    const input = updateSubjectSchema.parse({
      code: value(formData, 'code'),
      name: value(formData, 'name'),
      credits: value(formData, 'credits'),
      area: value(formData, 'area'),
      termId: value(formData, 'termId'),
      description: value(formData, 'description'),
      status: value(formData, 'status'),
    });

    const subject = await updateSubject(subjectId, input);
    revalidatePath('/admin/academic/subjects');
    return serialize(subject);
  });
}

export async function deleteSubjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();
    await deleteSubject(objectId.parse(value(formData, 'subjectId')));
    revalidatePath('/admin/academic/subjects');
    return { deleted: true as const };
  });
}

/**
 * Sets who teaches a subject. This grants no venture-review rights — those
 * come only from StudentVenture.facultyId.
 */
export async function setSubjectFacultyAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = assignSubjectFacultySchema.parse({
      subjectId: value(formData, 'subjectId'),
      facultyIds: values(formData, 'facultyIds'),
    });

    const result = await setSubjectFaculty(input.subjectId, input.facultyIds);
    revalidatePath('/admin/academic/subjects');
    return serialize(result);
  });
}

// ------------------------------------------------------------- Sessions ----

export async function createSessionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = createSubjectSessionSchema.parse({
      subjectId: value(formData, 'subjectId'),
      facultyId: value(formData, 'facultyId'),
      date: value(formData, 'date'),
      startTime: value(formData, 'startTime'),
      endTime: value(formData, 'endTime'),
      sessionType: value(formData, 'sessionType') ?? 'LECTURE',
      supportActivityId: value(formData, 'supportActivityId') ?? null,
      topic: value(formData, 'topic'),
      notes: value(formData, 'notes'),
    });

    const session = await createSubjectSession(input);
    revalidatePath('/admin/academic/sessions');
    revalidatePath('/admin/academic/workshops');
    return serialize(session);
  });
}

export async function updateSessionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const sessionId = objectId.parse(value(formData, 'sessionId'));
    const input = updateSubjectSessionSchema.parse({
      facultyId: value(formData, 'facultyId'),
      date: value(formData, 'date'),
      startTime: value(formData, 'startTime'),
      endTime: value(formData, 'endTime'),
      sessionType: value(formData, 'sessionType'),
      supportActivityId: value(formData, 'supportActivityId') ?? null,
      topic: value(formData, 'topic'),
      notes: value(formData, 'notes'),
    });

    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));

    const session = await updateSubjectSession(sessionId, clean);
    revalidatePath('/admin/academic/sessions');
    revalidatePath('/admin/academic/workshops');
    return serialize(session);
  });
}

export async function deleteSessionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();
    await deleteSubjectSession(objectId.parse(value(formData, 'sessionId')));
    revalidatePath('/admin/academic/sessions');
    revalidatePath('/admin/academic/workshops');
    return { deleted: true as const };
  });
}

// ----------------------------------------------------------- Attendance ----

/** Attendance is optional throughout — no rule anywhere requires it. */
export async function markAttendanceAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await requireRole('ADMIN', 'FACULTY');

    const sessionId = value(formData, 'sessionId');
    const studentIds = values(formData, 'studentId');

    const entries = studentIds.map((studentId) => ({
      studentId,
      status: value(formData, `status:${studentId}`) ?? 'PRESENT',
      remarks: value(formData, `remarks:${studentId}`),
    }));

    const input = markAttendanceSchema.parse({ sessionId, entries });
    const result = await markAttendance(input, actor.userId);

    revalidatePath(`/admin/academic/sessions/${sessionId}`);
    return result;
  });
}
