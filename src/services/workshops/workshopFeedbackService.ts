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

export interface WorkshopFeedbackRow {
  _id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  batch: string;
  email: string;
  submittedAt: string | null;
  /**
   * Kept on the record because the form asks for them, but nothing displays or
   * averages them: the office wanted what students wrote, not a score.
   */
  overallRating: number | null;
  understandingRating: number | null;
  speakerRating: number | null;
  relevanceRating: number | null;
  takeaway: string;
  /** What the file gave as the roll number, before it was matched.  */
  submittedRollNumber: string;
}

/**
 * The four scale questions, in the order the form asks them.
 *
 * `label` is a short stand-in for a table heading. The question itself is
 * whatever the imported file called it, which is different for every workshop.
 */
export const FEEDBACK_QUESTIONS = [
  { key: 'overall', field: 'overallRating', label: 'Overall quality', number: 1 },
  { key: 'understanding', field: 'understandingRating', label: 'Understood', number: 2 },
  { key: 'speaker', field: 'speakerRating', label: 'Speaker', number: 3 },
  { key: 'relevance', field: 'relevanceRating', label: 'Relevance', number: 4 },
] as const;

export type FeedbackQuestionKey = (typeof FEEDBACK_QUESTIONS)[number]['key'];

/** How one question was answered across every response. */
export interface QuestionStat {
  key: FeedbackQuestionKey;
  number: number;
  /** Short heading, for a column. */
  label: string;
  /** The question as the form worded it. Empty if the file had no such column. */
  question: string;
  /** How many people answered this one. Not every question is compulsory. */
  answered: number;
  /** Mean to one decimal place, or null when nobody answered. */
  average: number | null;
  /** How many gave each score. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** The questions a form asked, as it worded them. */
export interface FeedbackQuestions {
  overall?: string;
  understanding?: string;
  speaker?: string;
  relevance?: string;
  takeaway?: string;
}

export interface WorkshopFeedbackSummary {
  /** How many students responded. */
  responses: number;
  /** How many wrote something in the free-text box. */
  written: number;
  /**
   * One entry per scale question the form actually asked.
   *
   * Each question is counted on its own, and a mean is never taken across
   * questions: "the speaker" and "relevance" are different things, and one
   * number covering both would say nothing about either.
   */
  stats: QuestionStat[];
  /**
   * The questions asked, taken from the responses themselves.
   *
   * From the most recently imported response rather than the first: if the
   * form was reworded and re-imported, the current wording is the one to show.
   */
  questions: FeedbackQuestions;
}

export interface WorkshopFeedbackView {
  summary: WorkshopFeedbackSummary;
  rows: WorkshopFeedbackRow[];
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

  const feedback = await WorkshopFeedback.find({ workshopId })
    .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
      'studentId',
      'name email',
    )
    .sort({ submittedAt: 1, createdAt: 1 })
    .lean()
    .exec();

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
      overallRating: entry.overallRating ?? null,
      understandingRating: entry.understandingRating ?? null,
      speakerRating: entry.speakerRating ?? null,
      relevanceRating: entry.relevanceRating ?? null,
      takeaway: entry.takeaway ?? '',
      submittedRollNumber: entry.submittedRollNumber ?? '',
    };
  });

  // Whichever response was imported last carries the wording to show. They
  // agree in the ordinary case, where one file was imported once.
  const latest = [...feedback].sort(
    (a, b) => a.importedAt.getTime() - b.importedAt.getTime(),
  )[feedback.length - 1];

  const questions = latest?.questions ?? {};

  const stats: QuestionStat[] = FEEDBACK_QUESTIONS.map((question) => {
    const answers = rows
      .map((row) => row[question.field])
      .filter((value): value is number => typeof value === 'number');

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const answer of answers) {
      if (answer >= 1 && answer <= 5) distribution[answer as 1 | 2 | 3 | 4 | 5] += 1;
    }

    return {
      key: question.key,
      number: question.number,
      label: question.label,
      question: questions[question.key] ?? '',
      answered: answers.length,
      average:
        answers.length === 0
          ? null
          : Math.round((answers.reduce((total, value) => total + value, 0) / answers.length) * 10) /
            10,
      distribution,
    };
  });

  return {
    summary: {
      responses: rows.length,
      written: rows.filter((row) => row.takeaway.trim() !== '').length,
      questions,
      // A question nobody was asked is not a question with no answers: a sheet
      // without that column should show nothing, not a row of zeroes.
      stats: stats.filter((stat) => stat.answered > 0 || stat.question !== ''),
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
  overallRating?: number | null;
  understandingRating?: number | null;
  speakerRating?: number | null;
  relevanceRating?: number | null;
  takeaway?: string;
  /** How this file worded its questions. */
  questions?: FeedbackQuestions;
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
        overallRating: row.overallRating ?? null,
        understandingRating: row.understandingRating ?? null,
        speakerRating: row.speakerRating ?? null,
        relevanceRating: row.relevanceRating ?? null,
        takeaway: row.takeaway,
        questions: row.questions,
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
