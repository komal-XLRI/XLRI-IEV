import { Schema, type Model, type Types } from 'mongoose';
import { SUBMISSION_TYPES, type SubmissionType } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * One submission attempt. Resubmission creates a NEW document — previous
 * attempts are never overwritten, so the full history stays intact.
 */
export interface IVentureSubmission {
  _id: Types.ObjectId;

  studentVentureActivityId: Types.ObjectId;
  submittedBy: Types.ObjectId;

  attemptNumber: number;
  submissionType: SubmissionType;
  title?: string;
  content?: string;
  remarks?: string;

  submittedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ventureSubmissionSchema = new Schema<IVentureSubmission>(
  {
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      required: true,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    attemptNumber: { type: Number, required: true, min: 1 },
    submissionType: { type: String, required: true, enum: SUBMISSION_TYPES },
    title: { type: String, trim: true },
    content: { type: String, trim: true },
    remarks: { type: String, trim: true },

    submittedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'venturesubmissions' },
);

// The database is the last line of defence against a duplicated attempt number.
ventureSubmissionSchema.index({ studentVentureActivityId: 1, attemptNumber: 1 }, { unique: true });
ventureSubmissionSchema.index({ submittedBy: 1, submittedAt: -1 });

export const VentureSubmission: Model<IVentureSubmission> = registerModel<IVentureSubmission>(
  'VentureSubmission',
  ventureSubmissionSchema,
);
