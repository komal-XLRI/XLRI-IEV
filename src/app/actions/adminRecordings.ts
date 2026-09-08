'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { recordingFolderSchema, recordingSchema } from '@/validators/recordings';
import { objectId } from '@/validators/common';
import {
  createRecording,
  deleteRecording,
  setRecordingFolderLink,
  updateRecording,
} from '@/services/recordings/recordingService';
import { serialize } from '@/lib/utils/serialize';

/**
 * Recording mutations — administrators only.
 *
 * Each action re-checks the caller is an administrator: the middleware
 * redirect and the layout's role gate are both conveniences, and neither is on
 * the path a form POST actually takes. That matters more here than elsewhere,
 * because what these records hold is a private Drive link.
 */

const ADMIN_PATH = '/admin/academic/recordings';
const FACULTY_PATH = '/faculty/recordings';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/** Both roles read the same records from their own list, so both are revalidated. */
function revalidateRecordings() {
  revalidatePath(ADMIN_PATH);
  revalidatePath(FACULTY_PATH);
}

/** Present-but-empty means "clear this field", which is not the same as absent. */
function present(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : undefined;
}

function readRecordingFields(formData: FormData) {
  return {
    event: value(formData, 'event'),
    date: value(formData, 'date'),
    timings: present(formData, 'timings'),
    batch: present(formData, 'batch'),
    venue: present(formData, 'venue'),
    zoomLink: present(formData, 'zoomLink'),
    meetingId: present(formData, 'meetingId'),
    passcode: present(formData, 'passcode'),
    recordingLink: present(formData, 'recordingLink'),
    recordingPasscode: present(formData, 'recordingPasscode'),
  };
}

export async function createRecordingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const input = recordingSchema.parse(readRecordingFields(formData));

    const recording = await createRecording(input);
    revalidateRecordings();
    return serialize(recording);
  });
}

export async function updateRecordingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    await requireAdmin();

    const recordingId = objectId.parse(value(formData, 'recordingId'));
    const input = recordingSchema.parse(readRecordingFields(formData));

    const recording = await updateRecording(recordingId, input);
    revalidateRecordings();
    return serialize(recording);
  });
}

export async function deleteRecordingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  return runAction(async () => {
    await requireAdmin();

    const recordingId = objectId.parse(value(formData, 'recordingId'));
    await deleteRecording(recordingId);

    revalidateRecordings();
    return { deleted: true as const };
  });
}

/** Set the shared folder link, or submit it empty to take the banner down. */
export async function setRecordingFolderAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ link: string | null }>> {
  return runAction(async () => {
    await requireAdmin();

    const { link } = recordingFolderSchema.parse({ link: present(formData, 'link') });

    const saved = await setRecordingFolderLink(link);
    revalidateRecordings();
    return { link: saved };
  });
}
