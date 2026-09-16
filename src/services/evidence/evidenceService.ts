import 'server-only';
import type { ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Evidence, StudentVenture, StudentVentureActivity, VentureActivity } from '@/models';
import { sessionOption } from '@/lib/db/transaction';
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '@/lib/errors';
import { isAssignedReviewer, reviewerTypeForRole } from '@/lib/permissions/reviewAccess';
import type { Role } from '@/lib/constants/roles';
import {
  MAX_EVIDENCE_FILES_PER_SUBMISSION,
  MAX_EVIDENCE_FILE_BYTES,
  isAllowedEvidenceMimeType,
  resourceTypeForMime,
} from '@/lib/constants/uploads';
import {
  buildPublicId,
  deleteUpload,
  signUpload,
  signedAssetUrl,
  verifyUploadResponse,
} from '@/lib/cloudinary/signing';
import { uploadFolder } from '@/lib/cloudinary/client';
import type { RegisterEvidenceInput, RequestUploadSignatureInput } from '@/validators/submissions';
import { logger } from '@/lib/logger';

/**
 * Authorises an evidence operation against an activity record.
 *
 * The record is the scope for everything here: it belongs to exactly one
 * student for its whole life, which is what makes it safe to sign uploads
 * against before any submission exists.
 */
async function authoriseRecord(studentVentureActivityId: string, studentUserId: string) {
  const record = await StudentVentureActivity.findById(studentVentureActivityId).lean().exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  if (venture.studentId.toString() !== studentUserId) {
    throw new ForbiddenError('This activity does not belong to you');
  }

  return { record, venture };
}

/**
 * Issues a short-lived Cloudinary signature. The browser uploads directly to
 * Cloudinary; the API secret never leaves the server, and the signature is
 * bound to a folder and public_id the server chose.
 */
export async function requestUploadSignature(
  input: RequestUploadSignatureInput,
  studentUserId: string,
) {
  await connectToDatabase();

  const { record } = await authoriseRecord(input.studentVentureActivityId, studentUserId);

  const activity = await VentureActivity.findById(record.ventureActivityId)
    .select('status')
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');
  if (activity.status !== 'ACTIVE') {
    throw new RuleViolationError('This activity is not currently active');
  }

  if (!isAllowedEvidenceMimeType(input.fileType)) {
    throw new RuleViolationError('This file type is not accepted as evidence');
  }
  if (input.fileSize > MAX_EVIDENCE_FILE_BYTES) {
    throw new RuleViolationError('File exceeds the maximum evidence size');
  }

  // Counts drafts only. Files already adopted by an earlier attempt are that
  // attempt's record and must not consume this one's allowance.
  const staged = await countDraftEvidence(input.studentVentureActivityId);
  if (staged >= MAX_EVIDENCE_FILES_PER_SUBMISSION) {
    throw new RuleViolationError(
      `A submission can carry at most ${MAX_EVIDENCE_FILES_PER_SUBMISSION} evidence files.`,
    );
  }

  const resourceType = resourceTypeForMime(input.fileType);
  const publicId = buildPublicId(input.studentVentureActivityId, input.fileName);

  return signUpload({ publicId, resourceType });
}

/**
 * Records the metadata for an upload Cloudinary has accepted.
 *
 * The response signature is re-derived server-side, and the returned public_id
 * must sit inside the folder and record prefix we signed — so a forged callback
 * cannot attach an arbitrary asset to someone's activity.
 */
export async function registerEvidence(input: RegisterEvidenceInput, studentUserId: string) {
  await connectToDatabase();

  await authoriseRecord(input.studentVentureActivityId, studentUserId);

  const signatureValid = verifyUploadResponse({
    publicId: input.publicId,
    version: input.version,
    signature: input.signature,
  });

  if (!signatureValid) {
    logger.warn('Rejected evidence with an invalid Cloudinary signature', {
      studentVentureActivityId: input.studentVentureActivityId,
      publicId: input.publicId,
    });
    throw new ForbiddenError('Upload could not be verified');
  }

  const expectedPrefix = `${uploadFolder()}/${input.studentVentureActivityId}/`;
  if (!input.publicId.startsWith(expectedPrefix)) {
    throw new ForbiddenError('Upload does not belong to this activity');
  }

  const duplicate = await Evidence.findOne({ publicId: input.publicId })
    .select('_id')
    .lean()
    .exec();
  if (duplicate) throw new ConflictError('This file has already been recorded');

  const evidence = await Evidence.create({
    submissionId: null,
    studentVentureActivityId: input.studentVentureActivityId,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    publicId: input.publicId,
    fileType: input.fileType,
    resourceType: resourceTypeForMime(input.fileType),
    fileSize: input.fileSize,
    uploadedBy: studentUserId,
    uploadedAt: new Date(),
  });

  logger.info('Evidence staged', {
    evidenceId: evidence._id.toString(),
    studentVentureActivityId: input.studentVentureActivityId,
  });

  return evidence.toObject();
}

export async function listEvidence(submissionId: string) {
  await connectToDatabase();
  return Evidence.find({ submissionId }).sort({ uploadedAt: 1 }).lean().exec();
}

/** Files staged against a record that no attempt has adopted yet. */
export async function listDraftEvidence(studentVentureActivityId: string) {
  await connectToDatabase();
  return Evidence.find({ studentVentureActivityId, submissionId: null })
    .sort({ uploadedAt: 1 })
    .lean()
    .exec();
}

export async function countDraftEvidence(studentVentureActivityId: string): Promise<number> {
  await connectToDatabase();
  return Evidence.countDocuments({ studentVentureActivityId, submissionId: null }).exec();
}

/**
 * Hands every staged file to the attempt that has just been created.
 *
 * Runs inside `createSubmission`'s transaction, so an attempt and its evidence
 * become visible together — there is no instant where a submission exists with
 * its files still detached.
 */
export async function attachDraftEvidence(
  studentVentureActivityId: string,
  submissionId: string,
  session: ClientSession | null,
): Promise<number> {
  const result = await Evidence.updateMany(
    { studentVentureActivityId, submissionId: null },
    { $set: { submissionId } },
    sessionOption(session),
  ).exec();

  return result.modifiedCount;
}

/**
 * A student may remove their own evidence while it is still a draft.
 *
 * Once an attempt has adopted a file it is part of a submitted record that
 * reviewers may already have read, so it stays.
 */
export async function deleteEvidence(evidenceId: string, studentUserId: string) {
  await connectToDatabase();

  const evidence = await Evidence.findById(evidenceId).lean().exec();
  if (!evidence) throw new NotFoundError('Evidence not found');

  await authoriseRecord(evidence.studentVentureActivityId.toString(), studentUserId);

  if (evidence.uploadedBy.toString() !== studentUserId) {
    throw new ForbiddenError('This file does not belong to you');
  }

  if (evidence.submissionId) {
    throw new RuleViolationError(
      'This file is part of a submitted attempt and can no longer be removed.',
    );
  }

  await deleteUpload(evidence.publicId, evidence.resourceType);
  await Evidence.deleteOne({ _id: evidenceId }).exec();

  logger.info('Draft evidence deleted', { evidenceId });
}

/**
 * Who may open one evidence file.
 *
 * The same four rules the rest of the application already runs on: a student
 * sees their own venture, an assigned reviewer sees the venture they review,
 * an administrator sees everything, and nobody else sees anything. Being
 * faculty somewhere in the programme is not enough.
 */
async function authoriseViewer(
  studentVentureActivityId: string,
  viewer: { userId: string; role: Role },
) {
  if (viewer.role === 'ADMIN') return;

  const record = await StudentVentureActivity.findById(studentVentureActivityId).lean().exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  if (viewer.role === 'STUDENT') {
    if (venture.studentId.toString() !== viewer.userId) {
      throw new ForbiddenError('This file does not belong to you');
    }
    return;
  }

  const reviewerType = reviewerTypeForRole(viewer.role);
  if (!reviewerType || !isAssignedReviewer(venture, viewer.userId, reviewerType)) {
    throw new ForbiddenError('You are not the assigned reviewer for this venture');
  }
}

export interface EvidenceLink {
  url: string;
  fileName: string;
}

/**
 * Authorises the viewer and returns a short-lived link to the file.
 *
 * The stored `fileUrl` is deliberately not what anyone is sent to: the account
 * refuses to deliver PDFs over a public URL, and a public URL would outlive
 * the reader's right to read it in any case.
 */
export async function resolveEvidenceLink(
  evidenceId: string,
  viewer: { userId: string; role: Role },
  options: { download?: boolean } = {},
): Promise<EvidenceLink> {
  await connectToDatabase();

  const evidence = await Evidence.findById(evidenceId).lean().exec();
  if (!evidence) throw new NotFoundError('Evidence not found');

  await authoriseViewer(evidence.studentVentureActivityId.toString(), viewer);

  return {
    url: signedAssetUrl({
      publicId: evidence.publicId,
      resourceType: evidence.resourceType,
      download: options.download,
    }),
    fileName: evidence.fileName,
  };
}
