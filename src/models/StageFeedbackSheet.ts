import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * A feedback spreadsheet an administrator uploaded for one stage.
 *
 * The sheet itself is not kept — only who it was matched to. Each matched row
 * becomes a `StageFeedbackEntry` owned by one student, so a student can only
 * ever be shown their own row. Rows that matched nobody are listed here so the
 * administrator can see what to fix.
 */
export interface IStageFeedbackUnmatched {
  /** 1-based row number in the sheet. */
  line: number;
  /** The roll number or email the row gave, as written. */
  identifier: string;
}

export interface IStageFeedbackSheet {
  _id: Types.ObjectId;
  ventureActivityId: Types.ObjectId;
  title: string;
  fileName: string;
  /** The heading the rows were matched on, e.g. "Roll No". */
  matchedOn: string;
  totalRows: number;
  matchedRows: number;
  matchedStudents: number;
  unmatched: IStageFeedbackUnmatched[];
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const stageFeedbackSheetSchema = new Schema<IStageFeedbackSheet>(
  {
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    fileName: { type: String, required: true, trim: true, maxlength: 300 },
    matchedOn: { type: String, required: true, trim: true },
    totalRows: { type: Number, required: true, min: 0 },
    matchedRows: { type: Number, required: true, min: 0 },
    matchedStudents: { type: Number, required: true, min: 0 },
    unmatched: {
      type: [
        new Schema<IStageFeedbackUnmatched>(
          { line: { type: Number, required: true }, identifier: { type: String, default: '' } },
          { _id: false },
        ),
      ],
      default: [],
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'stagefeedbacksheets' },
);

stageFeedbackSheetSchema.index({ ventureActivityId: 1, createdAt: -1 });

export const StageFeedbackSheet: Model<IStageFeedbackSheet> = registerModel<IStageFeedbackSheet>(
  'StageFeedbackSheet',
  stageFeedbackSheetSchema,
);
