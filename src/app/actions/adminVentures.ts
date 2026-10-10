'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import {
  assignReviewersSchema,
  behaviourFeedbackSchema,
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
import {
  createPresentation,
  deletePresentation,
  setParticipantReceived,
  updatePresentation,
} from '@/services/ventures/presentationService';
import {
  createPresentationSchema,
  participantReceivedSchema,
  updatePresentationSchema,
} from '@/validators/presentations';
import {
  deleteBehaviourFeedback,
  saveBehaviourFeedback,
} from '@/services/ventures/behaviourService';
import { BEHAVIOUR_AREAS } from '@/lib/constants/behaviour';
import {
  getFeedbackQr,
  regenerateFeedbackToken,
  saveFeedbackFormConfig,
  type FeedbackQrResult,
} from '@/services/ventures/mentorFeedbackService';
import { feedbackFormConfigSchema } from '@/validators/mentorFeedback';
import { publicBaseUrl } from '@/lib/feedback/baseUrl';
import { serialize } from '@/lib/utils/serialize';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string' && v.length > 0);
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
      activityCode: value(formData, 'activityCode'),
      name: value(formData, 'name'),
      description: value(formData, 'description'),
      termId: value(formData, 'termId'),
      order: value(formData, 'order'),
      startDate: value(formData, 'startDate'),
      endDate: value(formData, 'endDate'),
      status: value(formData, 'status'),
    });

    const activity = await updateVentureActivity(activityId, input);

    revalidatePath('/admin/venture-activities');
    revalidatePath(`/admin/venture-activities/${activityId}`);
    revalidatePath(`/admin/venture-activities/${activityId}/edit`);
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

// ------------------------------------------------------ Presentations ----

function revalidatePresentations(ventureActivityId?: string) {
  revalidatePath('/admin/venture-activities');
  if (ventureActivityId) revalidatePath(`/admin/venture-activities/${ventureActivityId}`);
  else revalidatePath('/admin/venture-activities', 'layout');
  revalidatePath('/student', 'layout');
}

function presentationForm(formData: FormData) {
  return {
    presentedOn: value(formData, 'presentedOn') ?? '',
    startTime: submitted(formData, 'startTime') ?? '',
    driveUrl: submitted(formData, 'driveUrl') ?? '',
    status: value(formData, 'status'),
    studentRecordIds: values(formData, 'studentRecordIds'),
  };
}

/** Creates one presentation on a stage, with the students chosen for it. */
export async function createPresentationAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ presentationId: string }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = createPresentationSchema.parse({
      ventureActivityId: value(formData, 'ventureActivityId'),
      ...presentationForm(formData),
    });

    const result = await createPresentation(input, admin.userId);
    revalidatePresentations(input.ventureActivityId);
    return result;
  });
}

/** Edits one presentation — date, time, link, status and students. */
export async function updatePresentationAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ added: number; removed: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = updatePresentationSchema.parse({
      presentationId: value(formData, 'presentationId'),
      ...presentationForm(formData),
    });

    const result = await updatePresentation(input, admin.userId);
    revalidatePresentations();
    return result;
  });
}

export async function deletePresentationAction(
  presentationId: string,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    await deletePresentation(objectId.parse(presentationId), admin.userId);
    revalidatePresentations();
    return { deleted: true as const };
  });
}

/** Marks one student in one presentation received, or not. */
export async function setParticipantReceivedAction(
  participantId: string,
  received: boolean,
): Promise<ActionResult<{ received: boolean; stageCompleted: boolean }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const input = participantReceivedSchema.parse({ participantId, received });
    const result = await setParticipantReceived(input.participantId, input.received, admin.userId);
    revalidatePresentations();
    return result;
  });
}

// ------------------------------------------ Mentor feedback (Google Forms) ----

function revalidateMentorFeedback() {
  revalidatePath('/admin/venture-activities', 'layout');
  revalidatePath('/student', 'layout');
}

/** Sets, changes or clears the Google Form for one presentation. */
export async function saveFeedbackFormConfigAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ completed: number; ventureActivityId: string }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = feedbackFormConfigSchema.parse({
      presentationId: value(formData, 'presentationId'),
      title: submitted(formData, 'title'),
      prefillUrlTemplate: submitted(formData, 'prefillUrlTemplate') ?? '',
      enabled: formData.get('enabled') === 'on',
      requiredFeedbackCount: value(formData, 'requiredFeedbackCount'),
    });

    const result = await saveFeedbackFormConfig(input, admin.userId);
    revalidateMentorFeedback();
    return result;
  });
}

/**
 * The QR for one student in one presentation. Admin only — students never
 * receive a QR. The service refuses unless that student's presentation is
 * received and the stage has a usable form, whatever the page that asked
 * believed.
 */
export async function getFeedbackQrAction(
  participantId: string,
): Promise<ActionResult<FeedbackQrResult>> {
  return runAction(async () => {
    await requireAdmin();
    const id = objectId.parse(participantId);
    return getFeedbackQr(id, await publicBaseUrl());
  });
}

/** Revokes one participant's QR by issuing a new token. */
export async function regenerateFeedbackTokenAction(
  participantId: string,
): Promise<ActionResult<FeedbackQrResult>> {
  return runAction(async () => {
    await requireAdmin();
    const id = objectId.parse(participantId);
    await regenerateFeedbackToken(id);
    return getFeedbackQr(id, await publicBaseUrl());
  });
}

// ------------------------------------------------- HR & behaviour ----

function revalidateBehaviour() {
  revalidatePath('/admin/venture-activities', 'layout');
  revalidatePath('/student', 'layout');
}

/** Gives, or replaces, one student's HR & behaviour feedback on one stage. */
export async function saveBehaviourFeedbackAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = behaviourFeedbackSchema.parse({
      studentVentureActivityId: value(formData, 'studentVentureActivityId'),
      ratings: Object.fromEntries(
        BEHAVIOUR_AREAS.map((area) => [area.key, value(formData, `rating.${area.key}`)]),
      ),
      comments: submitted(formData, 'comments'),
    });

    await saveBehaviourFeedback(input, admin.userId);

    revalidateBehaviour();
    return { saved: true as const };
  });
}

export async function deleteBehaviourFeedbackAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();
    await deleteBehaviourFeedback(objectId.parse(value(formData, 'studentVentureActivityId')));
    revalidateBehaviour();
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
      scheduledDate: value(formData, 'scheduledDate'),
      startTime: value(formData, 'startTime'),
      endTime: value(formData, 'endTime'),
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
    revalidatePath(`/admin/venture-activities/${input.ventureActivityId}/edit`);
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

/** The raw value of a field that was on the form; undefined if it was not. */
function submitted(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw.trim() : undefined;
}

export async function updateStudentVentureAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const studentVentureId = objectId.parse(value(formData, 'studentVentureId'));

    // `submitted` keeps an empty field as '' rather than folding it to
    // undefined: on an edit form the two mean opposite things — "clear this"
    // and "this was not on the form" — and `value` cannot tell them apart, so
    // erasing a tagline used to be silently ignored.
    const input = updateStudentVentureSchema.parse({
      ventureName: submitted(formData, 'ventureName'),
      ventureTitle: submitted(formData, 'ventureTitle'),
      industry: submitted(formData, 'industry'),
      targetMarket: submitted(formData, 'targetMarket'),
      problemStatement: submitted(formData, 'problemStatement'),
      solution: submitted(formData, 'solution'),
      fundingStatus: submitted(formData, 'fundingStatus'),
      // An enum has no empty member, so this one still folds to undefined.
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
