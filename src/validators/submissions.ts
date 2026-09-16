import { z } from 'zod';
import { REVIEW_DECISIONS, REVIEWER_TYPES } from '@/lib/constants/status';
import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_FILE_BYTES } from '@/lib/constants/uploads';
import { objectId } from './common';

/**
 * `attemptNumber` and `submissionType` are absent by design — both are
 * computed on the server from persisted state. A client-supplied attempt
 * number is exactly the value an attacker would forge.
 */
export const createSubmissionSchema = z.object({
  studentVentureActivityId: objectId,
  title: z.string().trim().max(200).optional().or(z.literal('')),
  content: z.string().trim().max(20_000).optional().or(z.literal('')),
  remarks: z.string().trim().max(2000).optional().or(z.literal('')),
});

/** Review decision. `reviewerType` is derived from the caller's role, never sent. */
export const createReviewSchema = z.object({
  submissionId: objectId,
  status: z.enum(REVIEW_DECISIONS),
  comments: z.string().trim().max(4000).optional().or(z.literal('')),
});

/**
 * Uploads are scoped to the activity record, not to a submission.
 *
 * Evidence has to be attachable before the attempt exists — that is the only
 * way the server can refuse a submission with no evidence instead of accepting
 * it and asking for files afterwards. The record id is the stable thing that
 * exists at both moments.
 */
export const requestUploadSignatureSchema = z.object({
  studentVentureActivityId: objectId,
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES, {
    message: 'This file type is not accepted as evidence',
  }),
  fileSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_EVIDENCE_FILE_BYTES, 'File exceeds the maximum evidence size'),
});

/** Confirms an upload that Cloudinary has already accepted. */
export const registerEvidenceSchema = z.object({
  studentVentureActivityId: objectId,
  publicId: z.string().trim().min(1).max(300),
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().url(),
  fileType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES),
  fileSize: z.coerce.number().int().positive().max(MAX_EVIDENCE_FILE_BYTES),
  /** Cloudinary's response signature — re-verified server-side before saving. */
  signature: z.string().trim().min(1),
  version: z.coerce.number().int().positive(),
});

/**
 * The same decision, filed by an administrator for a reviewer who is not the
 * one logged in.
 *
 * `reviewerType` has to be stated here, because it cannot be derived from the
 * caller's role the way it is for a reviewer filing their own verdict. Which
 * person that resolves to is decided by the server from the venture's current
 * assignment, never sent by the form.
 */
export const reviewOnBehalfSchema = createReviewSchema.extend({
  reviewerType: z.enum(REVIEWER_TYPES, { message: 'Choose faculty or mentor' }),
});

/**
 * A correction to a verdict already on record.
 *
 * The reviewer it belongs to is not in here and cannot be changed: an edit
 * fixes what was decided, not who decided it. A verdict filed against the
 * wrong reviewer is deleted and filed again.
 */
export const updateReviewSchema = z.object({
  reviewId: objectId,
  status: z.enum(REVIEW_DECISIONS),
  comments: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReviewOnBehalfInput = z.infer<typeof reviewOnBehalfSchema>;
export type RequestUploadSignatureInput = z.infer<typeof requestUploadSignatureSchema>;
export type RegisterEvidenceInput = z.infer<typeof registerEvidenceSchema>;
