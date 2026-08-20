'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { createWorkshopSchema, workshopStatusSchema } from '@/validators/workshops';
import { objectId } from '@/validators/common';
import {
  createWorkshop,
  deleteWorkshop,
  setWorkshopStatus,
  updateWorkshop,
} from '@/services/workshops/workshopService';
import {
  sendWorkshopAnnouncement,
  type WorkshopEmailResult,
} from '@/services/workshops/workshopEmailService';
import { serialize } from '@/lib/utils/serialize';

/**
 * Workshop mutations.
 *
 * Server Actions rather than route handlers, because that is how every other
 * admin write in this application is done — the API routes exist only for
 * auth, import/export and direct uploads. Each action re-checks the caller is
 * an administrator: the middleware redirect and the layout's role gate are
 * both conveniences, and neither is on the path a form POST actually takes.
 */

const LIST_PATH = '/admin/academic/workshops';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/** Present-but-empty means "clear this field", which is not the same as absent. */
function present(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : undefined;
}

function readWorkshopFields(formData: FormData) {
  return {
    title: value(formData, 'title'),
    description: present(formData, 'description'),
    workshopType: value(formData, 'workshopType'),
    date: value(formData, 'date'),
    startTime: value(formData, 'startTime'),
    endTime: value(formData, 'endTime'),
    mode: value(formData, 'mode'),
    venue: present(formData, 'venue'),
    meetingLink: present(formData, 'meetingLink'),
    hostName: value(formData, 'hostName'),
    hostDesignation: present(formData, 'hostDesignation'),
    hostOrganisation: present(formData, 'hostOrganisation'),
    hostLinkedIn: present(formData, 'hostLinkedIn'),
    speakerName: value(formData, 'speakerName'),
    speakerDesignation: present(formData, 'speakerDesignation'),
    speakerOrganisation: present(formData, 'speakerOrganisation'),
    speakerLinkedIn: present(formData, 'speakerLinkedIn'),
    registrationLink: present(formData, 'registrationLink'),
    maxParticipants: value(formData, 'maxParticipants') ?? null,
  };
}

export async function createWorkshopAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = createWorkshopSchema.parse({
      ...readWorkshopFields(formData),
      status: value(formData, 'status') ?? 'DRAFT',
    });

    const workshop = await createWorkshop(input);
    revalidatePath(LIST_PATH);
    return serialize(workshop);
  });
}

export async function updateWorkshopAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const workshopId = objectId.parse(value(formData, 'workshopId'));

    // Only the fields this form actually submitted. Validation happens once, in
    // the service, against the patch merged onto the stored record — a patch on
    // its own cannot prove the mode rules still hold.
    const submitted = {
      ...readWorkshopFields(formData),
      status: value(formData, 'status'),
    };
    const patch = Object.fromEntries(
      Object.entries(submitted).filter(([key]) => formData.has(key)),
    );

    const workshop = await updateWorkshop(workshopId, patch);
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${workshopId}`);
    return serialize(workshop);
  });
}

export async function deleteWorkshopAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();

    const workshopId = objectId.parse(value(formData, 'workshopId'));
    await deleteWorkshop(workshopId);

    revalidatePath(LIST_PATH);
    return { deleted: true as const };
  });
}

/** Publish, unpublish back to draft, mark completed or cancel — one door. */
export async function setWorkshopStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const workshopId = objectId.parse(value(formData, 'workshopId'));
    const { status } = workshopStatusSchema.parse({ status: value(formData, 'status') });

    const workshop = await setWorkshopStatus(workshopId, status);
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${workshopId}`);
    return serialize(workshop);
  });
}

/**
 * Emails the workshop details to every active student.
 *
 * The send runs inside this action rather than being handed to a queue: the
 * cohort is small enough to finish in the request, and the administrator gets
 * a count of what actually went out instead of a promise that it will.
 */
export async function sendWorkshopEmailAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<WorkshopEmailResult>> {
  return runAction(async () => {
    await requireAdmin();

    const workshopId = objectId.parse(value(formData, 'workshopId'));
    const result = await sendWorkshopAnnouncement(workshopId);

    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${workshopId}`);
    return result;
  });
}
