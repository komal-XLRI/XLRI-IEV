import { Schema, type Model, type Types } from 'mongoose';
import { VENTURE_STATUSES, type VentureStatus } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * The student's venture record — one primary venture per student.
 *
 * `facultyId` / `mentorId` here are the single source of truth for *current*
 * venture review assignment. There is deliberately no
 * StudentActivityAssignments collection.
 */
export interface IStudentVenture {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;

  ventureName: string;
  ventureTitle?: string;
  industry?: string;
  targetMarket?: string;
  problemStatement?: string;
  solution?: string;
  fundingStatus?: string;

  currentVentureActivityId?: Types.ObjectId | null;

  facultyId?: Types.ObjectId | null;
  mentorId?: Types.ObjectId | null;

  status: VentureStatus;

  createdAt: Date;
  updatedAt: Date;
}

const studentVentureSchema = new Schema<IStudentVenture>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    ventureName: { type: String, required: true, trim: true },
    ventureTitle: { type: String, trim: true },
    industry: { type: String, trim: true },
    targetMarket: { type: String, trim: true },
    problemStatement: { type: String, trim: true },
    solution: { type: String, trim: true },
    fundingStatus: { type: String, trim: true },

    currentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'VentureActivity',
      default: null,
    },

    facultyId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    status: { type: String, required: true, enum: VENTURE_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true, collection: 'studentventures' },
);

// One primary venture per student.
studentVentureSchema.index({ studentId: 1 }, { unique: true });
studentVentureSchema.index({ facultyId: 1 });
studentVentureSchema.index({ mentorId: 1 });
studentVentureSchema.index({ status: 1 });

export const StudentVenture: Model<IStudentVenture> = registerModel<IStudentVenture>(
  'StudentVenture',
  studentVentureSchema,
);
