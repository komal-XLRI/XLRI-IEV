import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/** One cell of a student's row: the column heading and what was written under it. */
export interface IStageFeedbackField {
  label: string;
  value: string;
}

/**
 * One student's row from a stage feedback sheet.
 *
 * `studentId` is the owner, and every student-facing read filters on it — that
 * is what keeps one student from seeing another's feedback. `recordId` is the
 * student's stage record when they have one, used only to link to it.
 */
export interface IStageFeedbackEntry {
  _id: Types.ObjectId;
  sheetId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;
  studentId: Types.ObjectId;
  recordId: Types.ObjectId | null;
  line: number;
  fields: IStageFeedbackField[];
  createdAt: Date;
  updatedAt: Date;
}

const stageFeedbackEntrySchema = new Schema<IStageFeedbackEntry>(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: 'StageFeedbackSheet', required: true },
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordId: { type: Schema.Types.ObjectId, ref: 'StudentVentureActivity', default: null },
    line: { type: Number, required: true },
    fields: {
      type: [
        new Schema<IStageFeedbackField>(
          {
            label: { type: String, required: true },
            value: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'stagefeedbackentries' },
);

stageFeedbackEntrySchema.index({ studentId: 1, ventureActivityId: 1 });
stageFeedbackEntrySchema.index({ sheetId: 1 });

export const StageFeedbackEntry: Model<IStageFeedbackEntry> = registerModel<IStageFeedbackEntry>(
  'StageFeedbackEntry',
  stageFeedbackEntrySchema,
);
