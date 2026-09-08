import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Recording, RecordingFolder, RECORDING_FOLDER_KEY } from '@/models';
import { NotFoundError } from '@/lib/errors';
import { type RecordingInput } from '@/validators/recordings';

/**
 * Reads and writes for the session register.
 *
 * There is no student read here, and that is the point: these are private
 * links, and the surest way to keep one off a student's page is for no query
 * to exist that would put it there. Administrators and faculty share the one
 * list below.
 */

/** Oldest first, so the row numbers on the page match the register. */
export async function listRecordings() {
  await connectToDatabase();
  return Recording.find().sort({ date: 1, createdAt: 1 }).lean().exec();
}

export async function getRecording(recordingId: string) {
  await connectToDatabase();
  const recording = await Recording.findById(recordingId).lean().exec();
  if (!recording) throw new NotFoundError('Recording not found');
  return recording;
}

export async function createRecording(input: RecordingInput) {
  await connectToDatabase();
  const recording = await Recording.create(input);
  return recording.toObject();
}

/**
 * A full replace of the editable fields rather than a patch.
 *
 * The edit form renders every field, so the submission is always complete, and
 * `$unset` covers the optional ones — Mongo ignores `$set: undefined`, so
 * clearing a passcode has to be said explicitly or it silently stays.
 */
export async function updateRecording(recordingId: string, input: RecordingInput) {
  await connectToDatabase();

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) unset[key] = '';
    else set[key] = value;
  }

  const updated = await Recording.findByIdAndUpdate(
    recordingId,
    { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
    { returnDocument: 'after', runValidators: true },
  ).exec();

  if (!updated) throw new NotFoundError('Recording not found');
  return updated.toObject();
}

export async function deleteRecording(recordingId: string) {
  await connectToDatabase();
  const result = await Recording.findByIdAndDelete(recordingId).exec();
  if (!result) throw new NotFoundError('Recording not found');
  return { deleted: true as const };
}

/**
 * The one Drive folder holding all the presentations, or null when none is set.
 *
 * Returned as a bare string so the banner has nothing else to decide about.
 */
export async function getRecordingFolderLink(): Promise<string | null> {
  await connectToDatabase();
  const folder = await RecordingFolder.findOne({ key: RECORDING_FOLDER_KEY }).lean().exec();
  return folder?.link ?? null;
}

/** Passing nothing takes the banner down rather than storing an empty link. */
export async function setRecordingFolderLink(link: string | undefined) {
  await connectToDatabase();

  if (!link) {
    await RecordingFolder.deleteOne({ key: RECORDING_FOLDER_KEY }).exec();
    return null;
  }

  const folder = await RecordingFolder.findOneAndUpdate(
    { key: RECORDING_FOLDER_KEY },
    { $set: { link } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).exec();

  return folder?.link ?? null;
}
