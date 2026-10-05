import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/** One question and its answer, as the Google Form had them. */
export interface IMentorFeedbackAnswer {
  question: string;
  /** Google's item type, e.g. TEXT, PARAGRAPH_TEXT, MULTIPLE_CHOICE, SCALE, GRID. */
  type: string;
  /** Text for most items; a list for checkboxes; a list of rows for grids. */
  answer: string | string[] | string[][];
}

/**
 * One mentor's Google Form response on one presentation.
 *
 * The questions differ from stage to stage, so nothing here is question-
 * specific: `responses` keeps every item in form order, as Google sent it.
 * It belongs to the participant — one student in one presentation — whose QR
 * token the response carried; the other ids are denormalised from it for
 * reading by presentation, stage or student.
 */
export interface IMentorFeedback {
  _id: Types.ObjectId;

  presentationId?: Types.ObjectId | null;
  /** Null only on feedback stored before presentations became separate records. */
  participantId?: Types.ObjectId | null;
  studentVentureActivityId: Types.ObjectId;
  studentVentureId: Types.ObjectId;
  studentId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;

  googleFormId: string;
  publishedFormId: string;
  /** Google's response id. Unique: a resend or an edited response updates in place. */
  googleResponseId: string;

  mentorName?: string | null;
  mentorEmail?: string | null;

  submittedAt: Date;
  receivedAt: Date;

  responses: IMentorFeedbackAnswer[];

  /** A later response from the same mentor on the same participant replaced this one. */
  superseded: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<IMentorFeedbackAnswer>(
  {
    question: { type: String, required: true },
    type: { type: String, required: true },
    answer: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const mentorFeedbackSchema = new Schema<IMentorFeedback>(
  {
    presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', default: null },
    participantId: {
      type: Schema.Types.ObjectId,
      ref: 'PresentationParticipant',
      default: null,
    },
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      required: true,
    },
    studentVentureId: { type: Schema.Types.ObjectId, ref: 'StudentVenture', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },

    googleFormId: { type: String, required: true, trim: true },
    publishedFormId: { type: String, required: true, trim: true },
    googleResponseId: { type: String, required: true, trim: true },

    mentorName: { type: String, trim: true, default: null },
    mentorEmail: { type: String, trim: true, lowercase: true, default: null },

    submittedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true, default: () => new Date() },

    responses: { type: [answerSchema], default: [] },

    superseded: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: 'mentorfeedback' },
);

mentorFeedbackSchema.index({ googleResponseId: 1 }, { unique: true });
mentorFeedbackSchema.index({ participantId: 1, submittedAt: -1 });
mentorFeedbackSchema.index({ presentationId: 1 });
mentorFeedbackSchema.index({ studentVentureActivityId: 1, submittedAt: -1 });
mentorFeedbackSchema.index({ studentVentureActivityId: 1, mentorEmail: 1 });
mentorFeedbackSchema.index({ ventureActivityId: 1, superseded: 1 });
mentorFeedbackSchema.index({ studentVentureId: 1 });
mentorFeedbackSchema.index({ studentId: 1 });

export const MentorFeedback: Model<IMentorFeedback> = registerModel<IMentorFeedback>(
  'MentorFeedback',
  mentorFeedbackSchema,
);
