'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import {
  assignReviewersSchema,
  createStudentVentureSchema,
  createVentureActivitySchema,
  setSupportMappingsSchema,
  updateStudentVentureSchema,
  updateVentureActivitySchema,
  upsertSupportActivitySchema,
} from '@/validators/ventures';
import { objectId } from '@/validators/common';
import {
  createVentureActivity,
  deleteVentureActivity,
  setSupportMappings,
  updateVentureActivity,
  upsertSupportActivity,
} from '@/services/ventures/ventureActivityService';
import {
  assignReviewers,
  bootstrapActivityRecords,
  createStudentVenture,
  updateStudentVenture,
} from '@/services/ventures/studentVentureService';
import { serialize } from '@/lib/utils/serialize';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

// ------------------------------------------------- Venture activities ----

export async function createVentureActivityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = createVentureActivitySchema.parse({
      activityCode: value(formData, 'activityCode'),
      name: value(formData, 'name'),
      description: value(formData, 'description'),
      termId: value(formData, 'termId'),
      order: value(formData, 'order'),
      startDate: value(formData, 'startDate'),
      endDate: value(formData, 'endDate'),
      maxAttempts: value(formData, 'maxAttempts'),
      evidenceRequired: checkbox(formData, 'evidenceRequired'),
      status: value(formData, 'status') ?? 'ACTIVE',
    });

    const activity = await createVentureActivity(input);
    revalidatePath('/admin/venture-activities');
    return serialize(activity);
  });
}

export async function updateVentureActivityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const activityId = objectId.parse(value(formData, 'activityId'));

    const input = updateVentureActivitySchema.parse({
      name: value(formData, 'name'),
      description: value(formData, 'description'),
      termId: value(formData, 'termId'),
      order: value(formData, 'order'),
      startDate: value(formData, 'startDate'),
      endDate: value(formData, 'endDate'),
      maxAttempts: value(formData, 'maxAttempts'),
      evidenceRequired: checkbox(formData, 'evidenceRequired'),
      status: value(formData, 'status'),
    });

    const activity = await updateVentureActivity(activityId, input);

    revalidatePath('/admin/venture-activities');
    revalidatePath(`/admin/venture-activities/${activityId}`);
    return serialize(activity);
  });
}

export async function deleteVentureActivityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();
    await deleteVentureActivity(objectId.parse(value(formData, 'activityId')));
    revalidatePath('/admin/venture-activities');
    return { deleted: true as const };
  });
}

// ------------------------------------------------- Support activities ----

export async function upsertSupportActivityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = upsertSupportActivitySchema.parse({
      activityCode: value(formData, 'activityCode'),
      name: value(formData, 'name'),
      description: value(formData, 'description'),
      order: value(formData, 'order'),
      scheduleType: value(formData, 'scheduleType'),
    });

    const activity = await upsertSupportActivity(input);
    revalidatePath('/admin/support-activities');
    return serialize(activity);
  });
}

/** Replaces the full A-set for one V. The mapping is queried in both directions. */
export async function setSupportMappingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = setSupportMappingsSchema.parse({
      ventureActivityId: value(formData, 'ventureActivityId'),
      supportActivityIds: values(formData, 'supportActivityIds'),
    });

    const result = await setSupportMappings(input.ventureActivityId, input.supportActivityIds);

    revalidatePath('/admin/venture-activities');
    revalidatePath(`/admin/venture-activities/${input.ventureActivityId}`);
    revalidatePath('/admin/support-activities');
    return serialize(result);
  });
}

// -------------------------------------------------- Student ventures ----

export async function createStudentVentureAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ studentVentureId: string }>> {
  return runAction(async () => {
    await requireAdmin();

    const input = createStudentVentureSchema.parse({
      studentId: value(formData, 'studentId'),
      ventureName: value(formData, 'ventureName'),
      ventureTitle: value(formData, 'ventureTitle'),
      industry: value(formData, 'industry'),
      targetMarket: value(formData, 'targetMarket'),
      problemStatement: value(formData, 'problemStatement'),
      solution: value(formData, 'solution'),
      fundingStatus: value(formData, 'fundingStatus'),
      facultyId: value(formData, 'facultyId') ?? null,
      mentorId: value(formData, 'mentorId') ?? null,
      status: value(formData, 'status') ?? 'ACTIVE',
    });

    const result = await createStudentVenture(input);

    revalidatePath('/admin/ventures');
    revalidatePath('/admin');
    return result;
  });
}

export async function updateStudentVentureAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const studentVentureId = objectId.parse(value(formData, 'studentVentureId'));

    const input = updateStudentVentureSchema.parse({
      ventureName: value(formData, 'ventureName'),
      ventureTitle: value(formData, 'ventureTitle'),
      industry: value(formData, 'industry'),
      targetMarket: value(formData, 'targetMarket'),
      problemStatement: value(formData, 'problemStatement'),
      solution: value(formData, 'solution'),
      fundingStatus: value(formData, 'fundingStatus'),
      status: value(formData, 'status'),
    });

    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const venture = await updateStudentVenture(studentVentureId, clean);

    revalidatePath('/admin/ventures');
    revalidatePath(`/admin/ventures/${studentVentureId}`);
    return serialize(venture);
  });
}

/**
 * Admin-only. Students and reviewers can never change who reviews a venture —
 * that is the whole point of keeping assignment on StudentVenture.
 */
export async function assignReviewersAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const studentVentureId = objectId.parse(value(formData, 'studentVentureId'));
    const input = assignReviewersSchema.parse({
      facultyId: value(formData, 'facultyId') ?? null,
      mentorId: value(formData, 'mentorId') ?? null,
    });

    const venture = await assignReviewers(studentVentureId, input);

    revalidatePath('/admin/ventures');
    revalidatePath(`/admin/ventures/${studentVentureId}`);
    return serialize(venture);
  });
}

/** Backfills activity rows after new Venture/Support Activities are added. */
export async function syncActivityRecordsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ activitiesCreated: number; supportsCreated: number }>> {
  return runAction(async () => {
    await requireAdmin();

    const studentVentureId = objectId.parse(value(formData, 'studentVentureId'));
    const result = await bootstrapActivityRecords(studentVentureId);

    revalidatePath(`/admin/ventures/${studentVentureId}`);
    return result;
  });
}
