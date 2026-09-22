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
 * copies of the same response would list the same student three times.
 *
 * It keeps `submittedName`, `submittedEmail` and `submittedRollNumber` exactly
 * as the file gave them, alongside the `studentId` they were matched to. The
 * match is a lookup on a roll number a student typed into a form, and keeping
 * what they actually wrote is what lets somebody check a match that looks
 * wrong. Display uses the account, not these.
 *
 * The four ratings are the form's four scale questions, 1 to 5. Every one of
 * them is optional, and none is displayed: the programme office asked for the
 * responses, not a score. They are kept because the form collects them and
 * throwing away an answer a student gave would be the harder thing to undo.
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
  overallRating?: number | null;
  /** How well the session helped them understand the topic, 1–5. */
  understandingRating?: number | null;
  /** The speaker's knowledge and delivery, 1–5. */
  speakerRating?: number | null;
  /** How relevant and applicable the insights were, 1–5. */
  relevanceRating?: number | null;

  /** Their key takeaway, in their own words. Often left blank. */
  takeaway?: string;

  /**
   * The questions this student was actually asked, as the form worded them.
   *
   * Kept with the response rather than against the workshop, because that is
   * what makes a response self-describing: a "4" means nothing without the
   * question, and the questions are rewritten for every workshop — the IP Law
   * form asks about IP Law. Storing them per response costs a few hundred
   * bytes and means a re-import can change the wording without stranding the
   * answers that were given under the old wording.
   */
  questions?: {
    overall?: string;
    understanding?: string;
    speaker?: string;
    relevance?: string;
    takeaway?: string;
  };

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

/**
 * The questions one form asked.
 *
 * A survey question is a sentence, sometimes two, with the scale spelled out
 * inside it — "(5 being the highest and 1 being the lowest)" — so 500 is a
 * length that fits a real one rather than a label.
 */
const questionsSchema = new Schema(
  {
    overall: { type: String, trim: true, maxlength: 500 },
    understanding: { type: String, trim: true, maxlength: 500 },
    speaker: { type: String, trim: true, maxlength: 500 },
    relevance: { type: String, trim: true, maxlength: 500 },
    takeaway: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const workshopFeedbackSchema = new Schema<IWorkshopFeedback>(
  {
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    submittedAt: { type: Date, default: null },

    submittedName: { type: String, trim: true, maxlength: 200 },
    submittedEmail: { type: String, trim: true, lowercase: true, maxlength: 200 },
    submittedRollNumber: { type: String, trim: true, uppercase: true, maxlength: 40 },

    overallRating: rating,
    understandingRating: rating,
    speakerRating: rating,
    relevanceRating: rating,

    // Long, because it is a free-text box and people write paragraphs in it.
    takeaway: { type: String, trim: true, maxlength: 4000 },

    // Its own schema rather than an inline object: an inline one with a `type`
    // key reads as a SchemaType declaration and the whole field is dropped
    // without complaint, which is exactly what happened the first time.
    questions: { type: questionsSchema, default: undefined },

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
