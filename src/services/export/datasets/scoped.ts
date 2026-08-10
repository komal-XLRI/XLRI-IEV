import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Evidence, Review, StudentVenture, VentureSubmission } from '@/models';
import { getReviewQueue } from '@/services/reviews/reviewService';
import {
  getVentureByStudentId,
  getVentureProgress,
} from '@/services/ventures/studentVentureService';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { sortRows } from '@/services/reports/scope';
import { humanise } from '../filterLabels';
import { defineDataset, countSummary } from './types';

/**
 * Datasets that are inherently scoped to the caller.
 *
 * The scope is taken from the authenticated session, never from the query
 * string — a reviewer cannot widen their export to another reviewer's queue by
 * editing the URL, and a student cannot export another student's venture.
 */

// ------------------------------------------------------- Reviewer ----

interface ReviewQueueRow {
  studentName: string;
  studentEmail: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  maxAttempts: number;
  myVerdict: string;
  otherVerdict: string;
  activityStatus: string;
  updatedAt: Date;
}

export const myReviewQueueDataset = defineDataset<ReviewQueueRow>({
  key: 'my-review-queue',
  title: 'My review queue',
  description: 'Submissions from ventures assigned to you.',
  fileBase: 'my-review-queue',
  roles: ['FACULTY', 'MENTOR'],
  defaultSortLabel: 'Most recently updated',
  columns: [
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 20 },
    { key: 'studentEmail', header: 'Email', value: (r) => r.studentEmail, width: 26 },
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 20 },
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Activity', value: (r) => r.activityName, width: 26 },
    {
      key: 'attemptNumber',
      header: 'Attempt',
      type: 'number',
      align: 'right',
      value: (r) => r.attemptNumber,
      width: 8,
    },
    {
      key: 'maxAttempts',
      header: 'Max',
      type: 'number',
      align: 'right',
      value: (r) => r.maxAttempts,
      width: 7,
    },
    { key: 'myVerdict', header: 'My verdict', value: (r) => humanise(r.myVerdict), width: 14 },
    {
      key: 'otherVerdict',
      header: 'Other reviewer',
      value: (r) => humanise(r.otherVerdict),
      width: 14,
    },
    {
      key: 'activityStatus',
      header: 'Activity status',
      value: (r) => humanise(r.activityStatus),
      width: 16,
    },
    { key: 'updatedAt', header: 'Updated', type: 'datetime', value: (r) => r.updatedAt, width: 18 },
  ],
  load: async ({ actor, filters }) => {
    if (actor.role !== 'FACULTY' && actor.role !== 'MENTOR') {
      throw new ForbiddenError('Only reviewers can export a review queue');
    }

    const queue = await getReviewQueue(
      { userId: actor.userId, role: actor.role },
      { state: 'ALL' },
    );

    const rows: ReviewQueueRow[] = queue.map((item) => ({
      studentName: item.venture.studentId?.name ?? 'Unknown',
      studentEmail: item.venture.studentId?.email ?? '',
      ventureName: item.venture.ventureName,
      activityCode: item.activity.activityCode,
      activityName: item.activity.name,
      attemptNumber: item.record.attemptNumber,
      maxAttempts: item.activity.maxAttempts,
      myVerdict: item.myReviewStatus,
      otherVerdict: item.otherReviewStatus,
      activityStatus: item.record.status,
      updatedAt: item.record.updatedAt,
    }));

    const filtered = filters.activityStatus
      ? rows.filter((row) => row.activityStatus === filters.activityStatus)
      : rows;

    return sortRows(
      filtered,
      filters.sortBy,
      filters.sortDir,
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  },
  summarise: (rows) => [
    { label: 'Records', value: String(rows.length) },
    {
      label: 'Awaiting your verdict',
      value: String(rows.filter((r) => r.myVerdict === 'PENDING').length),
    },
  ],
});

// -------------------------------------------------------- Student ----

interface MyProgressRow {
  activityCode: string;
  activityName: string;
  status: string;
  facultyVerdict: string;
  mentorVerdict: string;
  attemptsUsed: number;
  maxAttempts: number;
  attemptsRemaining: number;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  completedAt: Date | null;
}

export const myProgressDataset = defineDataset<MyProgressRow>({
  key: 'my-progress',
  title: 'My venture progress',
  fileBase: 'my-progress',
  roles: ['STUDENT'],
  defaultSortLabel: 'Activity order',
  columns: [
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Activity', value: (r) => r.activityName, width: 30 },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 18 },
    {
      key: 'facultyVerdict',
      header: 'Faculty review',
      value: (r) => humanise(r.facultyVerdict),
      width: 15,
    },
    {
      key: 'mentorVerdict',
      header: 'Mentor review',
      value: (r) => humanise(r.mentorVerdict),
      width: 15,
    },
    {
      key: 'attemptsUsed',
      header: 'Attempts used',
      type: 'number',
      align: 'right',
      value: (r) => r.attemptsUsed,
      width: 12,
    },
    {
      key: 'maxAttempts',
      header: 'Max attempts',
      type: 'number',
      align: 'right',
      value: (r) => r.maxAttempts,
      width: 11,
    },
    {
      key: 'attemptsRemaining',
      header: 'Remaining',
      type: 'number',
      align: 'right',
      value: (r) => r.attemptsRemaining,
      width: 10,
    },
    { key: 'startDate', header: 'Start', type: 'date', value: (r) => r.startDate, width: 12 },
    { key: 'endDate', header: 'End', type: 'date', value: (r) => r.endDate, width: 12 },
    {
      key: 'durationDays',
      header: 'Days',
      type: 'number',
      align: 'right',
      value: (r) => r.durationDays,
      width: 7,
    },
    {
      key: 'completedAt',
      header: 'Completed',
      type: 'datetime',
      value: (r) => r.completedAt,
      width: 18,
    },
  ],
  load: async ({ actor }) => {
    const venture = await getVentureByStudentId(actor.userId);
    if (!venture) throw new NotFoundError('You do not have a venture yet');

    const progress = await getVentureProgress(venture._id.toString());

    return progress.map((entry) => ({
      activityCode: entry.activity.activityCode,
      activityName: entry.activity.name,
      status: entry.uiState,
      facultyVerdict: entry.record.facultyReviewStatus,
      mentorVerdict: entry.record.mentorReviewStatus,
      attemptsUsed: entry.attempt.attemptsUsed,
      maxAttempts: entry.activity.maxAttempts,
      attemptsRemaining: entry.attempt.attemptsRemaining,
      startDate: entry.activity.startDate,
      endDate: entry.activity.endDate,
      durationDays: entry.activity.durationDays,
      completedAt: entry.record.completedAt ?? null,
    }));
  },
  summarise: (rows) => [
    { label: 'Activities', value: String(rows.length) },
    { label: 'Completed', value: String(rows.filter((r) => r.status === 'COMPLETED').length) },
  ],
});

interface MySubmissionRow {
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  submissionType: string;
  title: string | null;
  submittedAt: Date;
  facultyDecision: string | null;
  facultyComments: string | null;
  mentorDecision: string | null;
  mentorComments: string | null;
  evidenceCount: number;
  evidenceFiles: string;
}

export const mySubmissionsDataset = defineDataset<MySubmissionRow>({
  key: 'my-submissions',
  title: 'My submissions and feedback',
  description: 'Every attempt, with both reviewers’ comments and the evidence attached.',
  fileBase: 'my-submissions',
  roles: ['STUDENT'],
  defaultSortLabel: 'Activity order, then attempt',
  columns: [
    { key: 'activityCode', header: 'Code', value: (r) => r.activityCode, width: 7 },
    { key: 'activityName', header: 'Activity', value: (r) => r.activityName, width: 24 },
    {
      key: 'attemptNumber',
      header: 'Attempt',
      type: 'number',
      align: 'right',
      value: (r) => r.attemptNumber,
      width: 8,
    },
    { key: 'submissionType', header: 'Type', value: (r) => humanise(r.submissionType), width: 10 },
    { key: 'title', header: 'Title', value: (r) => r.title, width: 26 },
    {
      key: 'submittedAt',
      header: 'Submitted',
      type: 'datetime',
      value: (r) => r.submittedAt,
      width: 18,
    },
    {
      key: 'facultyDecision',
      header: 'Faculty decision',
      value: (r) => humanise(r.facultyDecision ?? undefined),
      width: 15,
    },
    {
      key: 'facultyComments',
      header: 'Faculty comments',
      value: (r) => r.facultyComments,
      width: 40,
    },
    {
      key: 'mentorDecision',
      header: 'Mentor decision',
      value: (r) => humanise(r.mentorDecision ?? undefined),
      width: 15,
    },
    { key: 'mentorComments', header: 'Mentor comments', value: (r) => r.mentorComments, width: 40 },
    {
      key: 'evidenceCount',
      header: 'Evidence',
      type: 'number',
      align: 'right',
      value: (r) => r.evidenceCount,
      width: 9,
    },
    { key: 'evidenceFiles', header: 'Files', value: (r) => r.evidenceFiles, width: 40 },
  ],
  load: async ({ actor }) => {
    await connectToDatabase();

    const venture = await getVentureByStudentId(actor.userId);
    if (!venture) throw new NotFoundError('You do not have a venture yet');

    const progress = await getVentureProgress(venture._id.toString());
    const recordIds = progress.map((entry) => entry.recordId);

    const submissions = await VentureSubmission.find({
      studentVentureActivityId: { $in: recordIds },
    })
      .sort({ attemptNumber: 1 })
      .lean()
      .exec();

    if (submissions.length === 0) return [];

    const submissionIds = submissions.map((submission) => submission._id);

    const [reviews, evidence] = await Promise.all([
      Review.find({ submissionId: { $in: submissionIds } })
        .lean()
        .exec(),
      Evidence.find({ submissionId: { $in: submissionIds } })
        .lean()
        .exec(),
    ]);

    const activityByRecord = new Map(progress.map((entry) => [entry.recordId, entry.activity]));

    const rows: MySubmissionRow[] = submissions.map((submission) => {
      const key = submission._id.toString();
      const activity = activityByRecord.get(submission.studentVentureActivityId.toString());
      const faculty = reviews.find(
        (r) => r.submissionId.toString() === key && r.reviewerType === 'FACULTY',
      );
      const mentor = reviews.find(
        (r) => r.submissionId.toString() === key && r.reviewerType === 'MENTOR',
      );
      const files = evidence.filter((e) => e.submissionId?.toString() === key);

      return {
        activityCode: activity?.activityCode ?? '',
        activityName: activity?.name ?? '',
        attemptNumber: submission.attemptNumber,
        submissionType: submission.submissionType,
        title: submission.title ?? null,
        submittedAt: submission.submittedAt,
        facultyDecision: faculty?.status ?? null,
        facultyComments: faculty?.comments ?? null,
        mentorDecision: mentor?.status ?? null,
        mentorComments: mentor?.comments ?? null,
        evidenceCount: files.length,
        evidenceFiles: files.map((file) => file.fileName).join(', '),
      };
    });

    return rows.sort(
      (a, b) => a.activityCode.localeCompare(b.activityCode) || a.attemptNumber - b.attemptNumber,
    );
  },
  summarise: countSummary('Submissions'),
});

// ------------------------------------------- Reviewer venture roster ----

interface AssignedVentureRow {
  studentName: string;
  studentEmail: string;
  ventureName: string;
  industry: string | null;
  currentActivity: string | null;
  completed: number;
  total: number;
  percentage: number;
  status: string;
}

export const myVenturesDataset = defineDataset<AssignedVentureRow>({
  key: 'my-ventures',
  title: 'My assigned ventures',
  fileBase: 'my-ventures',
  roles: ['FACULTY', 'MENTOR'],
  defaultSortLabel: 'Progress, then venture name',
  columns: [
    { key: 'studentName', header: 'Student', value: (r) => r.studentName, width: 20 },
    { key: 'studentEmail', header: 'Email', value: (r) => r.studentEmail, width: 26 },
    { key: 'ventureName', header: 'Venture', value: (r) => r.ventureName, width: 22 },
    { key: 'industry', header: 'Industry', value: (r) => r.industry, width: 18 },
    {
      key: 'currentActivity',
      header: 'Current activity',
      value: (r) => r.currentActivity,
      width: 24,
    },
    {
      key: 'completed',
      header: 'Completed',
      type: 'number',
      align: 'right',
      value: (r) => r.completed,
      width: 10,
    },
    {
      key: 'total',
      header: 'Total',
      type: 'number',
      align: 'right',
      value: (r) => r.total,
      width: 8,
    },
    {
      key: 'percentage',
      header: 'Progress',
      type: 'percent',
      align: 'right',
      value: (r) => r.percentage,
      width: 10,
    },
    { key: 'status', header: 'Status', value: (r) => humanise(r.status), width: 12 },
  ],
  load: async ({ actor, filters }) => {
    if (actor.role !== 'FACULTY' && actor.role !== 'MENTOR') {
      throw new ForbiddenError('Only reviewers can export an assigned venture list');
    }

    await connectToDatabase();

    const assignment =
      actor.role === 'FACULTY' ? { facultyId: actor.userId } : { mentorId: actor.userId };

    const ventures = await StudentVenture.find(assignment)
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .populate<{
        currentVentureActivityId: { _id: unknown; activityCode: string; name: string } | null;
      }>('currentVentureActivityId', 'activityCode name')
      .lean()
      .exec();

    const rows: AssignedVentureRow[] = [];

    for (const venture of ventures) {
      const progress = await getVentureProgress(venture._id.toString());
      const completed = progress.filter((entry) => entry.record.status === 'COMPLETED').length;

      rows.push({
        studentName: venture.studentId?.name ?? 'Unknown',
        studentEmail: venture.studentId?.email ?? '',
        ventureName: venture.ventureName,
        industry: venture.industry ?? null,
        currentActivity: venture.currentVentureActivityId
          ? `${venture.currentVentureActivityId.activityCode} ${venture.currentVentureActivityId.name}`
          : null,
        completed,
        total: progress.length,
        percentage: progress.length === 0 ? 0 : Math.round((completed / progress.length) * 100),
        status: venture.status,
      });
    }

    return sortRows(
      rows,
      filters.sortBy,
      filters.sortDir,
      (a, b) => b.percentage - a.percentage || a.ventureName.localeCompare(b.ventureName),
    );
  },
  summarise: countSummary('Ventures'),
});
