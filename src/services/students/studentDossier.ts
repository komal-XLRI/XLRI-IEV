import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  Evidence,
  Review,
  StudentProfile,
  StudentVenture,
  StudentVentureActivity,
  SubjectAttendance,
  User,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import { NotFoundError } from '@/lib/errors';
import { getVentureProgress, type VentureActivityProgress } from '@/services/ventures/studentVentureService';
import { getStudentSupportActivities } from '@/services/support/supportService';
import type { AttendanceStatus, ReviewDecision, ReviewerType } from '@/lib/constants/status';

/**
 * Everything the programme office holds on one student, assembled once.
 *
 * Built as a single read rather than left to the page, because the answer spans
 * seven collections and the joins between them are the whole difficulty: a
 * review belongs to a submission, which belongs to an activity record, which
 * belongs to a venture, which belongs to the student. Doing that in a component
 * is how a page ends up with a request waterfall and a subtly wrong join.
 *
 * Read-only by construction — nothing here writes, so opening a student's file
 * cannot change it.
 */

export interface DossierSubmission {
  submissionId: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  submissionType: string;
  title: string | null;
  content: string | null;
  remarks: string | null;
  submittedAt: Date;
  evidenceCount: number;
  reviews: Array<{
    reviewId: string;
    reviewerName: string;
    reviewerType: ReviewerType;
    status: ReviewDecision;
    comments: string | null;
    reviewedAt: Date;
  }>;
}

export interface DossierClassAttendance {
  sessionId: string;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  topic: string | null;
  status: AttendanceStatus;
  remarks: string | null;
}

export interface StudentDossier {
  user: {
    _id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
  };
  profile: {
    rollNumber: string;
    batch: string;
    cluster: string | null;
    background: string | null;
    strengths: string | null;
    weakness: string | null;
    personalContext: string | null;
  } | null;
  venture: {
    _id: string;
    ventureName: string;
    ventureTitle: string | null;
    industry: string | null;
    targetMarket: string | null;
    problemStatement: string | null;
    solution: string | null;
    fundingStatus: string | null;
    status: string;
    createdAt: Date;
    facultyName: string | null;
    facultyEmail: string | null;
    mentorName: string | null;
    mentorEmail: string | null;
  } | null;
  progress: VentureActivityProgress[];
  support: Awaited<ReturnType<typeof getStudentSupportActivities>>;
  submissions: DossierSubmission[];
  classAttendance: DossierClassAttendance[];
  totals: {
    activitiesCompleted: number;
    activitiesTotal: number;
    percentage: number;
    attemptsUsed: number;
    submissions: number;
    reviewsReceived: number;
    ventureAttendancePresent: number;
    ventureAttendanceAbsent: number;
    ventureAttendancePending: number;
    classesAttended: number;
    classesRecorded: number;
    supportCompleted: number;
    supportTotal: number;
  };
}

export async function getStudentDossier(userId: string): Promise<StudentDossier> {
  await connectToDatabase();

  const user = await User.findById(userId)
    .select('name email phone role status createdAt')
    .lean()
    .exec();

  if (!user) throw new NotFoundError('Student not found');
  // Guarded rather than merely filtered: this page shows a student's file, and
  // rendering a faculty member's account under that heading would be wrong even
  // though most of it would come back empty.
  if (user.role !== 'STUDENT') throw new NotFoundError('That account is not a student');

  const [profile, venture] = await Promise.all([
    StudentProfile.findOne({ userId }).lean().exec(),
    StudentVenture.findOne({ studentId: userId })
      .populate<{ facultyId: { name: string; email: string } | null }>('facultyId', 'name email')
      .populate<{ mentorId: { name: string; email: string } | null }>('mentorId', 'name email')
      .lean()
      .exec(),
  ]);

  const ventureId = venture?._id.toString() ?? null;

  const [progress, support] = await Promise.all([
    ventureId ? getVentureProgress(ventureId) : Promise.resolve([]),
    ventureId ? getStudentSupportActivities(ventureId) : Promise.resolve([]),
  ]);

  const submissions = ventureId ? await loadSubmissions(ventureId) : [];
  const classAttendance = await loadClassAttendance(userId);

  const activitiesCompleted = progress.filter((row) => row.record.status === 'COMPLETED').length;
  const countAttendance = (status: string) =>
    progress.filter((row) => row.record.attendanceStatus === status).length;

  return {
    user: {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      status: user.status,
      createdAt: user.createdAt,
    },
    profile: profile
      ? {
          rollNumber: profile.rollNumber,
          batch: profile.batch,
          cluster: profile.cluster ?? null,
          background: profile.background ?? null,
          strengths: profile.strengths ?? null,
          weakness: profile.weakness ?? null,
          personalContext: profile.personalContext ?? null,
        }
      : null,
    venture: venture
      ? {
          _id: venture._id.toString(),
          ventureName: venture.ventureName,
          ventureTitle: venture.ventureTitle ?? null,
          industry: venture.industry ?? null,
          targetMarket: venture.targetMarket ?? null,
          problemStatement: venture.problemStatement ?? null,
          solution: venture.solution ?? null,
          fundingStatus: venture.fundingStatus ?? null,
          status: venture.status,
          createdAt: venture.createdAt,
          facultyName: venture.facultyId?.name ?? null,
          facultyEmail: venture.facultyId?.email ?? null,
          mentorName: venture.mentorId?.name ?? null,
          mentorEmail: venture.mentorId?.email ?? null,
        }
      : null,
    progress,
    support,
    submissions,
    classAttendance,
    totals: {
      activitiesCompleted,
      activitiesTotal: progress.length,
      percentage:
        progress.length === 0 ? 0 : Math.round((activitiesCompleted / progress.length) * 100),
      attemptsUsed: progress.reduce((sum, row) => sum + row.record.attemptNumber, 0),
      submissions: submissions.length,
      reviewsReceived: submissions.reduce((sum, row) => sum + row.reviews.length, 0),
      ventureAttendancePresent: countAttendance('PRESENT'),
      ventureAttendanceAbsent: countAttendance('ABSENT'),
      ventureAttendancePending: countAttendance('PENDING'),
      classesAttended: classAttendance.filter(
        (row) => row.status === 'PRESENT' || row.status === 'LATE',
      ).length,
      classesRecorded: classAttendance.length,
      supportCompleted: support.filter(({ record }) => record.status === 'COMPLETED').length,
      supportTotal: support.length,
    },
  };
}

/**
 * Every attempt the student has made, newest first, with the verdicts on it.
 *
 * Submissions are never overwritten — a resubmission is a new document — so
 * this is the full history rather than the current state, which is exactly what
 * makes it worth showing on a file like this.
 */
async function loadSubmissions(studentVentureId: string): Promise<DossierSubmission[]> {
  const records = await StudentVentureActivity.find({ studentVentureId })
    .select('ventureActivityId')
    .lean()
    .exec();

  if (records.length === 0) return [];

  const recordIds = records.map((record) => record._id);

  const [submissions, activities] = await Promise.all([
    VentureSubmission.find({ studentVentureActivityId: { $in: recordIds } })
      .sort({ submittedAt: -1 })
      .lean()
      .exec(),
    VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
      .select('activityCode name')
      .lean()
      .exec(),
  ]);

  if (submissions.length === 0) return [];

  const [reviews, evidence] = await Promise.all([
    Review.find({ submissionId: { $in: submissions.map((s) => s._id) } })
      .populate<{ reviewerId: { name: string } | null }>('reviewerId', 'name')
      .sort({ reviewedAt: 1 })
      .lean()
      .exec(),
    // Counted rather than listed: the file needs "there is evidence", and the
    // files themselves live behind signed URLs on the activity screen.
    Evidence.aggregate<{ _id: unknown; count: number }>([
      { $match: { submissionId: { $in: submissions.map((s) => s._id) } } },
      { $group: { _id: '$submissionId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
  const recordToActivity = new Map(
    records.map((record) => [record._id.toString(), record.ventureActivityId.toString()]),
  );
  const evidenceBySubmission = new Map(evidence.map((row) => [String(row._id), row.count]));

  const reviewsBySubmission = new Map<string, DossierSubmission['reviews']>();
  for (const review of reviews) {
    const key = review.submissionId.toString();
    const bucket = reviewsBySubmission.get(key) ?? [];
    bucket.push({
      reviewId: review._id.toString(),
      reviewerName: review.reviewerId?.name ?? 'Unknown reviewer',
      reviewerType: review.reviewerType,
      status: review.status,
      comments: review.comments ?? null,
      reviewedAt: review.reviewedAt,
    });
    reviewsBySubmission.set(key, bucket);
  }

  return submissions.map((submission) => {
    const activityId = recordToActivity.get(submission.studentVentureActivityId.toString());
    const activity = activityId ? activityById.get(activityId) : undefined;

    return {
      submissionId: submission._id.toString(),
      activityCode: activity?.activityCode ?? '—',
      activityName: activity?.name ?? 'Unknown activity',
      attemptNumber: submission.attemptNumber,
      submissionType: submission.submissionType,
      title: submission.title ?? null,
      content: submission.content ?? null,
      remarks: submission.remarks ?? null,
      submittedAt: submission.submittedAt,
      evidenceCount: evidenceBySubmission.get(submission._id.toString()) ?? 0,
      reviews: reviewsBySubmission.get(submission._id.toString()) ?? [],
    };
  });
}

/** Class attendance, which is a separate axis from Venture Activity attendance. */
async function loadClassAttendance(userId: string): Promise<DossierClassAttendance[]> {
  const rows = await SubjectAttendance.find({ studentId: userId })
    .populate<{
      sessionId: {
        _id: unknown;
        date: Date;
        startTime: string;
        endTime: string;
        topic?: string;
        subjectId: { code: string; name: string } | null;
      } | null;
    }>({
      path: 'sessionId',
      select: 'date startTime endTime topic subjectId',
      populate: { path: 'subjectId', select: 'code name' },
    })
    .lean()
    .exec();

  return rows
    .map((row) => ({
      sessionId: row.sessionId?._id ? String(row.sessionId._id) : row._id.toString(),
      date: row.sessionId?.date ?? null,
      startTime: row.sessionId?.startTime ?? null,
      endTime: row.sessionId?.endTime ?? null,
      subjectCode: row.sessionId?.subjectId?.code ?? null,
      subjectName: row.sessionId?.subjectId?.name ?? null,
      topic: row.sessionId?.topic ?? null,
      status: row.status,
      remarks: row.remarks ?? null,
    }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}
