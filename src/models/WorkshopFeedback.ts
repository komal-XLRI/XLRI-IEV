import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * What a student said about a workshop, as collected by the feedback form.
 *
 * The responses live in a Google Form and arrive here as a spreadsheet, one
 * file per workshop. That shape is the reason for two decisions:
 *
 * It keys on `{ workshopId, studentId }` and re-importing replaces rather than
 * appends. A form is exported more than once — once while responses are still
 * coming in, once when they have stopped — and an import that stacked three
 * copies of the same response would quietly double every average on the page.
 *
 * It keeps `submittedName`, `submittedEmail` and `submittedRollNumber` exactly
 * as the file gave them, alongside the `studentId` they were matched to. The
 * match is a lookup on a roll number a student typed into a form, and keeping
 * what they actually wrote is what lets somebody check a match that looks
 * wrong. Display uses the account, not these.
 *
 * The four ratings are the form's four scale questions, 1 to 5. They are
 * stored as named fields rather than an array of answers because the page
 * shows them individually — "speaker" and "relevance" are different questions
 * and averaging them together would say nothing.
 */
export interface IWorkshopFeedback {
  _id: Types.ObjectId;

  workshopId: Types.ObjectId;
  /** The student it was matched to. A `User` with role STUDENT. */
  studentId: Types.ObjectId;

  /** When the student submitted the form, if the export carried a timestamp. */
  submittedAt?: Date | null;

  submittedName?: string;
  submittedEmail?: string;
  submittedRollNumber?: string;

  /** Overall quality of the workshop, 1–5. */
  overallRating: number;
  /** How well the session helped them understand the topic, 1–5. */
  understandingRating?: number | null;
  /** The speaker's knowledge and delivery, 1–5. */
  speakerRating?: number | null;
  /** How relevant and applicable the insights were, 1–5. */
  relevanceRating?: number | null;

  /** Their key takeaway, in their own words. Often left blank. */
  takeaway?: string;

  /** Which administrator imported it, and when. */
  importedBy: Types.ObjectId;
  importedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/** A 1–5 answer. Null rather than absent when a question went unanswered. */
const rating = {
  type: Number,
  min: 1,
  max: 5,
  default: null,
} as const;

const workshopFeedbackSchema = new Schema<IWorkshopFeedback>(
  {
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    submittedAt: { type: Date, default: null },

    submittedName: { type: String, trim: true, maxlength: 200 },
    submittedEmail: { type: String, trim: true, lowercase: true, maxlength: 200 },
    submittedRollNumber: { type: String, trim: true, uppercase: true, maxlength: 40 },

    overallRating: { type: Number, required: true, min: 1, max: 5 },
    understandingRating: rating,
    speakerRating: rating,
    relevanceRating: rating,

    // Long, because it is a free-text box and people write paragraphs in it.
    takeaway: { type: String, trim: true, maxlength: 4000 },

    importedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    importedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// One response per student per workshop. Enforced here and not only in the
// import, because the index is the thing that holds when two administrators
// upload the same export at the same moment.
workshopFeedbackSchema.index({ workshopId: 1, studentId: 1 }, { unique: true });

export const WorkshopFeedback: Model<IWorkshopFeedback> = registerModel<IWorkshopFeedback>(
  'WorkshopFeedback',
  workshopFeedbackSchema,
);
