import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentProfile, User, Workshop, WorkshopFeedback } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { exactPattern } from '@/lib/utils/regex';

/**
 * Workshop feedback.
 *
 * Responses are collected in a Google Form and imported from its export, one
 * file per workshop — there is no form on this system for a student to fill
 * in, and this service deliberately offers no way to write a single response
 * by hand. Feedback is a record of what a cohort said, and a row an
 * administrator typed in themselves would be indistinguishable from one a
 * student submitted.
 */

/** The four scale questions, in the order the form asks them. */
export const FEEDBACK_QUESTIONS = [
  { field: 'overallRating', label: 'Overall quality', number: 1 },
  { field: 'understandingRating', label: 'Helped me understand', number: 2 },
  { field: 'speakerRating', label: "Speaker's knowledge", number: 3 },
  { field: 'relevanceRating', label: 'Relevance', number: 4 },
] as const;

export type FeedbackRatingField = (typeof FEEDBACK_QUESTIONS)[number]['field'];

export interface WorkshopFeedbackRow {
  _id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  batch: string;
  email: string;
  submittedAt: string | null;
  overallRating: number;
  understandingRating: number | null;
  speakerRating: number | null;
  relevanceRating: number | null;
  takeaway: string;
  /**
   * Set when the roll number in the file belongs to somebody other than the
   * account it was matched to — which should be impossible, and is shown
   * rather than hidden precisely because of that.
   */
  submittedRollNumber: string;
}

export interface WorkshopFeedbackSummary {
  /** How many students responded. */
  responses: number;
  /** Active students on the programme, for a response rate. */
  cohort: number;
  /** Mean of each question, to one decimal place. Null when unanswered. */
  averages: Record<FeedbackRatingField, number | null>;
  /** Count of each 1–5 answer to the overall question, for the distribution bar. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  /** How many wrote something in the free-text box. */
  written: number;
}

export interface WorkshopFeedbackView {
  summary: WorkshopFeedbackSummary;
  rows: WorkshopFeedbackRow[];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

/**
 * Every response to one workshop, newest submission first.
 *
 * Names come from the account, not from what was typed into the form: the two
 * agree in the ordinary case, and where they do not, the account is the one
 * every other screen in this system shows.
 */
export async function getWorkshopFeedback(workshopId: string): Promise<WorkshopFeedbackView> {
  await connectToDatabase();

  const [feedback, cohort] = await Promise.all([
    WorkshopFeedback.find({ workshopId })
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .sort({ submittedAt: 1, createdAt: 1 })
      .lean()
      .exec(),
    User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }),
  ]);

  const studentIds = feedback
    .map((entry) => (entry.studentId?._id ? String(entry.studentId._id) : ''))
    .filter((id) => id !== '');

  const profiles = await StudentProfile.find({ userId: { $in: studentIds } })
    .select('userId rollNumber batch')
    .lean()
    .exec();

  const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

  const rows: WorkshopFeedbackRow[] = feedback.map((entry) => {
    const student = entry.studentId;
    const key = student?._id ? String(student._id) : '';
    const profile = profileByUser.get(key);

    return {
      _id: entry._id.toString(),
      studentId: key,
      // A response whose student account has since been deleted still counts
      // towards the ratings — the workshop was still rated.
      studentName: student?.name ?? entry.submittedName ?? 'Former student',
      rollNumber: profile?.rollNumber ?? entry.submittedRollNumber ?? '',
      batch: profile?.batch ?? '',
      email: student?.email ?? entry.submittedEmail ?? '',
      submittedAt: entry.submittedAt ? entry.submittedAt.toISOString() : null,
      overallRating: entry.overallRating,
      understandingRating: entry.understandingRating ?? null,
      speakerRating: entry.speakerRating ?? null,
      relevanceRating: entry.relevanceRating ?? null,
      takeaway: entry.takeaway ?? '',
      submittedRollNumber: entry.submittedRollNumber ?? '',
    };
  });

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    const score = row.overallRating;
    if (score >= 1 && score <= 5) distribution[score as 1 | 2 | 3 | 4 | 5] += 1;
  }

  const averages = Object.fromEntries(
    FEEDBACK_QUESTIONS.map((question) => [
      question.field,
      mean(
        rows
          .map((row) => row[question.field])
          .filter((value): value is number => typeof value === 'number'),
      ),
    ]),
  ) as Record<FeedbackRatingField, number | null>;

  return {
    summary: {
      responses: rows.length,
      cohort,
      averages,
      distribution,
      written: rows.filter((row) => row.takeaway.trim() !== '').length,
    },
    rows,
  };
}

/** Response counts for a set of workshops, for the list page. */
export async function countFeedbackByWorkshop(): Promise<Map<string, number>> {
  await connectToDatabase();

  const counts = await WorkshopFeedback.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: '$workshopId', count: { $sum: 1 } } },
  ]).exec();

  return new Map(counts.map((entry) => [String(entry._id), entry.count]));
}

// ------------------------------------------------------------- importing ----

export interface FeedbackImportRow {
  rollNumber: string;
  email?: string;
  name?: string;
  submittedAt?: Date | null;
  overallRating: number;
  understandingRating?: number | null;
  speakerRating?: number | null;
  relevanceRating?: number | null;
  takeaway?: string;
}

/**
 * Finds the student a response belongs to.
 *
 * The roll number is the key, not the email address: students fill the form
 * from whichever account they happen to be signed into, and the sheet is full
 * of personal Gmail addresses that match nothing here. The email is a fallback
 * for a row whose roll number was mistyped, and matching neither is an error
 * on that row — never a silently dropped response.
 */
async function matchStudent(row: FeedbackImportRow): Promise<string> {
  const roll = row.rollNumber.trim().toUpperCase();

  const profile = await StudentProfile.findOne({ rollNumber: exactPattern(roll) })
    .select('userId')
    .lean()
    .exec();

  if (profile) return profile.userId.toString();

  if (row.email) {
    const user = await User.findOne({ email: row.email.trim().toLowerCase(), role: 'STUDENT' })
      .select('_id')
      .lean()
      .exec();

    if (user) return user._id.toString();
  }

  throw new ValidationError(
    `No student has roll number "${row.rollNumber}"${
      row.email ? `, and no student account uses ${row.email}` : ''
    }. Check the roll number, or add the student first.`,
  );
}

/** The workshop a feedback import was started for. */
export async function assertWorkshopExists(workshopId: string): Promise<void> {
  await connectToDatabase();

  const workshop = await Workshop.exists({ _id: workshopId });
  if (!workshop) throw new NotFoundError('Workshop not found');
}

/**
 * Says whether a row would replace a response already on record, without
 * writing anything — so the preview can warn before a second export of the
 * same form overwrites thirty rows.
 */
export async function previewWorkshopFeedback(
  workshopId: string,
  row: FeedbackImportRow,
): Promise<'created' | 'updated'> {
  await connectToDatabase();

  const studentId = await matchStudent(row);
  const existing = await WorkshopFeedback.exists({ workshopId, studentId });

  return existing ? 'updated' : 'created';
}

/**
 * Records one response, replacing that student's previous one for this
 * workshop if there is one.
 *
 * An upsert rather than an insert because the same form gets exported more
 * than once, and the second export contains the first export's rows.
 */
export async function saveWorkshopFeedback(
  workshopId: string,
  row: FeedbackImportRow,
  importedBy: string,
): Promise<'created' | 'updated'> {
  await connectToDatabase();

  const studentId = await matchStudent(row);

  const result = await WorkshopFeedback.updateOne(
    { workshopId, studentId },
    {
      $set: {
        submittedAt: row.submittedAt ?? null,
        submittedName: row.name,
        submittedEmail: row.email,
        submittedRollNumber: row.rollNumber,
        overallRating: row.overallRating,
        understandingRating: row.understandingRating ?? null,
        speakerRating: row.speakerRating ?? null,
        relevanceRating: row.relevanceRating ?? null,
        takeaway: row.takeaway,
        importedBy,
        importedAt: new Date(),
      },
    },
    { upsert: true },
  ).exec();

  return result.upsertedCount > 0 ? 'created' : 'updated';
}

/** Removes one response. */
export async function deleteWorkshopFeedback(feedbackId: string): Promise<void> {
  await connectToDatabase();

  const result = await WorkshopFeedback.findByIdAndDelete(feedbackId).exec();
  if (!result) throw new NotFoundError('Feedback not found');
}

/** Removes every response for a workshop — for an import that went in wrong. */
export async function clearWorkshopFeedback(workshopId: string): Promise<number> {
  await connectToDatabase();

  const result = await WorkshopFeedback.deleteMany({ workshopId }).exec();
  return result.deletedCount ?? 0;
}
