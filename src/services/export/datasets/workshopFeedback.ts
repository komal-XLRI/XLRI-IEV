import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentProfile, Workshop, WorkshopFeedback } from '@/models';
import { FEEDBACK_QUESTIONS } from '@/services/workshops/workshopFeedbackService';
import { defineDataset } from './types';

/**
 * Workshop feedback, responses and aggregation together.
 *
 * One file carries both because they are read together: the averages say how
 * the workshop landed, and the rows are where somebody goes to find out why.
 * Splitting them into two downloads would guarantee that the pair gets
 * separated in somebody's Downloads folder.
 *
 * The aggregation rides in the export's summary block rather than as extra
 * rows in the table. A mean is not a response, and a row that looked like a
 * student but was really a total would be counted as a student by the next
 * person to open this in Excel.
 *
 * Column headings are the short labels, not the questions — a heading 130
 * characters wide makes a spreadsheet unreadable — and the questions
 * themselves are named in full in the summary, so the file still says what was
 * asked.
 */

interface FeedbackExportRow {
  workshopTitle: string;
  workshopDate: Date | null;
  studentName: string;
  rollNumber: string;
  batch: string;
  email: string;
  submittedAt: Date | null;
  overallRating: number | null;
  understandingRating: number | null;
  speakerRating: number | null;
  relevanceRating: number | null;
  takeaway: string;
  /** Carried on every row so the summary can name the questions. */
  questions: Record<string, string | undefined>;
}

/** A mean to one decimal place, or a dash when nobody answered. */
function average(values: number[]): string {
  if (values.length === 0) return '—';
  return (Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10).toFixed(1);
}

export const workshopFeedbackDataset = defineDataset<FeedbackExportRow>({
  key: 'workshop-feedback',
  title: 'Workshop feedback',
  description:
    'Every response to a workshop feedback form, with each question averaged beneath. Feedback is imported from the form export and gates nothing.',
  fileBase: 'workshop-feedback',
  roles: ['ADMIN'],
  defaultSortLabel: 'Submission time',
  columns: [
    { key: 'workshopTitle', header: 'Workshop', value: (r) => r.workshopTitle, width: 28 },
    {
      key: 'workshopDate',
      header: 'Workshop date',
      type: 'date',
      value: (r) => r.workshopDate,
      width: 14,
    },
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 22 },
    { key: 'rollNumber', header: 'Roll number', value: (r) => r.rollNumber, width: 14 },
    { key: 'batch', header: 'Batch', value: (r) => r.batch, width: 9 },
    { key: 'email', header: 'Email', value: (r) => r.email, width: 26 },
    {
      key: 'submittedAt',
      header: 'Submitted',
      type: 'datetime',
      value: (r) => r.submittedAt,
      width: 18,
    },
    {
      key: 'overallRating',
      header: 'Q1 Overall quality',
      type: 'number',
      align: 'right',
      value: (r) => r.overallRating,
      width: 12,
    },
    {
      key: 'understandingRating',
      header: 'Q2 Understood',
      type: 'number',
      align: 'right',
      value: (r) => r.understandingRating,
      width: 12,
    },
    {
      key: 'speakerRating',
      header: 'Q3 Speaker',
      type: 'number',
      align: 'right',
      value: (r) => r.speakerRating,
      width: 12,
    },
    {
      key: 'relevanceRating',
      header: 'Q4 Relevance',
      type: 'number',
      align: 'right',
      value: (r) => r.relevanceRating,
      width: 12,
    },
    { key: 'takeaway', header: 'Q5 Key takeaway', value: (r) => r.takeaway, width: 50 },
  ],
  load: async ({ filters }) => {
    await connectToDatabase();

    // Unfiltered, this is every workshop's feedback, which is the right answer
    // for a cross-workshop export and the reason the workshop is a column.
    const feedbackQuery: Record<string, unknown> = {};
    if (filters.workshopId) feedbackQuery.workshopId = filters.workshopId;
    if (filters.studentId) feedbackQuery.studentId = filters.studentId;

    const feedback = await WorkshopFeedback.find(feedbackQuery)
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .sort({ submittedAt: 1, createdAt: 1 })
      .lean()
      .exec();

    if (feedback.length === 0) return [];

    const [workshops, profiles] = await Promise.all([
      Workshop.find({ _id: { $in: feedback.map((entry) => entry.workshopId) } })
        .select('title date')
        .lean()
        .exec(),
      StudentProfile.find({
        userId: {
          $in: feedback
            .map((entry) => (entry.studentId?._id ? String(entry.studentId._id) : ''))
            .filter((id) => id !== ''),
        },
      })
        .select('userId rollNumber batch')
        .lean()
        .exec(),
    ]);

    const workshopById = new Map(workshops.map((workshop) => [workshop._id.toString(), workshop]));
    const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

    return feedback.map((entry) => {
      const workshop = workshopById.get(entry.workshopId.toString());
      const student = entry.studentId;
      const key = student?._id ? String(student._id) : '';
      const profile = profileByUser.get(key);

      return {
        workshopTitle: workshop?.title ?? '—',
        workshopDate: workshop?.date ?? null,
        studentName: student?.name ?? entry.submittedName ?? 'Former student',
        rollNumber: profile?.rollNumber ?? entry.submittedRollNumber ?? '',
        batch: profile?.batch ?? '',
        email: student?.email ?? entry.submittedEmail ?? '',
        submittedAt: entry.submittedAt ?? null,
        overallRating: entry.overallRating ?? null,
        understandingRating: entry.understandingRating ?? null,
        speakerRating: entry.speakerRating ?? null,
        relevanceRating: entry.relevanceRating ?? null,
        takeaway: entry.takeaway ?? '',
        questions: (entry.questions ?? {}) as Record<string, string | undefined>,
      };
    });
  },
  summarise: (rows) => {
    if (rows.length === 0) return [{ label: 'Responses', value: '0' }];

    const written = rows.filter((row) => row.takeaway.trim() !== '').length;

    // The wording of the most recent import, the same one the screen shows.
    const questions = rows[rows.length - 1]?.questions ?? {};

    const perQuestion = FEEDBACK_QUESTIONS.flatMap((question) => {
      const answers = rows
        .map((row) => row[question.field])
        .filter((value): value is number => typeof value === 'number');

      const wording = questions[question.key];
      if (answers.length === 0 && !wording) return [];

      const counts = [5, 4, 3, 2, 1]
        .map((score) => `${score}★ ${answers.filter((answer) => answer === score).length}`)
        .join(' · ');

      return [
        {
          label: `Q${question.number} ${question.label}`,
          value: `Average ${average(answers)} from ${answers.length} answer${
            answers.length === 1 ? '' : 's'
          } — ${counts}`,
        },
        // The question itself, so the file does not depend on somebody
        // remembering what Q3 was about.
        ...(wording ? [{ label: `Q${question.number} asked`, value: wording }] : []),
      ];
    });

    return [
      { label: 'Responses', value: String(rows.length) },
      { label: 'Wrote a comment', value: String(written) },
      ...perQuestion,
    ];
  },
});
