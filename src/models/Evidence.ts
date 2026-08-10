import { Schema, type Model, type Types } from 'mongoose';
import { CLOUDINARY_RESOURCE_TYPES, type CloudinaryResourceType } from '@/lib/constants/uploads';
import { registerModel } from './registerModel';

/**
 * Cloudinary metadata only. File binaries are never stored in MongoDB.
 *
 * Evidence is staged against the *activity record* and adopted by a submission
 * when the attempt is created. That is what lets a student attach files before
 * submitting — and therefore what lets the server refuse a submission that is
 * missing required evidence, rather than accepting it and asking afterwards.
 *
 * So `submissionId` is null for as long as the file is a draft. Every reader
 * of evidence queries by submission id, so a draft is invisible to history,
 * reviewers and exports until the attempt it belongs to exists.
 */
export interface IEvidence {
  _id: Types.ObjectId;

  /** The attempt this file belongs to. Null while it is still a draft. */
  submissionId: Types.ObjectId | null;
  /** The activity record it was staged against. Set for the file's whole life. */
  studentVentureActivityId: Types.ObjectId;

  fileName: string;
  fileUrl: string;
  publicId: string;

  /** Original MIME type reported at upload time. */
  fileType: string;
  resourceType: CloudinaryResourceType;
  fileSize: number;

  uploadedBy: Types.ObjectId;
  uploadedAt: Date;

  createdAt: Date;
}

const evidenceSchema = new Schema<IEvidence>(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: 'VentureSubmission',
      required: false,
      default: null,
    },
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      required: true,
    },

    fileName: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },

    fileType: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, enum: CLOUDINARY_RESOURCE_TYPES },
    fileSize: { type: Number, required: true, min: 0 },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'evidences' },
);

evidenceSchema.index({ submissionId: 1 });
// Serves the draft lookup: the files staged against a record but not yet
// adopted by an attempt.
evidenceSchema.index({ studentVentureActivityId: 1, submissionId: 1 });
evidenceSchema.index({ publicId: 1 }, { unique: true });

export const Evidence: Model<IEvidence> = registerModel<IEvidence>('Evidence', evidenceSchema);
