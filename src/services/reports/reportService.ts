import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  Review,
  StudentVenture,
  StudentVentureActivity,
  User,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import type { ReviewStatus, StudentActivityStatus } from '@/lib/constants/status';
import { completionPercentage } from '@/lib/rules/progression';
import type { ReportFilters } from '@/validators/reportFilters';
import {
  applyScope,
  dateRangeClause,
  resolveActivityScope,
  resolveVentureScope,
  sortRows,
} from './scope';

const NO_FILTERS: ReportFilters = {};

// ------------------------------------------------------ Admin overview ----

export interface AdminOverview {
  totalStudents: number;
  totalVentures: number;
  activeVentures: number;
  completedActivities: number;
  underReview: number;
  revisionRequired: number;
  maxAttemptsReached: number;
  facultyCount: number;
  mentorCount: number;
  unassignedVentures: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  await connectToDatabase();

  const [
    totalStudents,
    totalVentures,
    activeVentures,
    facultyCount,
    mentorCount,
    activityCounts,
    unassignedVentures,
  ] = await Promise.all([
    User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }).exec(),
    StudentVenture.countDocuments().exec(),
    StudentVenture.countDocuments({ status: 'ACTIVE' }).exec(),
    User.countDocuments({ role: 'FACULTY', status: 'ACTIVE' }).exec(),
    User.countDocuments({ role: 'MENTOR', status: 'ACTIVE' }).exec(),
    StudentVentureActivity.aggregate<{ _id: StudentActivityStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec(),
    StudentVenture.countDocuments({
      $or: [{ facultyId: null }, { mentorId: null }],
    }).exec(),
  ]);

  const byStatus = new Map(activityCounts.map((row) => [row._id, row.count]));

  return {
    totalStudents,
    totalVentures,
    activeVentures,
    completedActivities: byStatus.get('COMPLETED') ?? 0,
    underReview: byStatus.get('UNDER_REVIEW') ?? 0,
    revisionRequired: byStatus.get('REVISION_REQUIRED') ?? 0,
    maxAttemptsReached: byStatus.get('MAX_ATTEMPTS_REACHED') ?? 0,
    facultyCount,
    mentorCount,
    unassignedVentures,
  };
}

// ------------------------------------------------- Student progress ----

export interface StudentProgressRow {
  studentVentureId: string;
  studentName: string;
  studentEmail: string;
  rollNumber: string | null;
  batch: string | null;
  ventureName: string;
  industry: string | null;
  ventureStatus: string;
  facultyName: string | null;
  mentorName: string | null;
  completed: number;
  total: number;
  percentage: number;
  currentActivity: string | null;
  notStarted: number;
  inProgress: number;
  underReview: number;
  revisionRequired: number;
  maxAttemptsReached: number;
}

/**
 * Progress per venture.
 *
 * `termId` / `ventureActivityId` narrow which activities count towards the
 * totals, so "progress in Term 2" is a genuinely different number from overall
 * progress rather than the same figure with a caption.
 */
export async function getStudentProgressReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<StudentProgressRow[]> {
  await connectToDatabase();

  const [ventureScope, activityScope] = await Promise.all([
    resolveVentureScope(filters),
    resolveActivityScope(filters),
  ]);

  const ventureQuery: Record<string, unknown> = {};
  applyScope(ventureQuery, '_id', ventureScope);

  const ventures = await StudentVenture.find(ventureQuery)
    .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
      'studentId',
      'name email',
    )
    .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
    .populate<{ mentorId: { _id: unknown; name: string } | null }>('mentorId', 'name')
    .populate<{
      currentVentureActivityId: { _id: unknown; activityCode: string; name: string } | null;
    }>('currentVentureActivityId', 'activityCode name')
    .lean()
    .exec();

  if (ventures.length === 0) return [];

  const recordQuery: Record<string, unknown> = {
    studentVentureId: { $in: ventures.map((venture) => venture._id) },
  };
  applyScope(recordQuery, 'ventureActivityId', activityScope);
  if (filters.activityStatus) recordQuery.status = filters.activityStatus;

  const records = await StudentVentureActivity.find(recordQuery)
    .select('studentVentureId status')
    .lean()
    .exec();

  const byVenture = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.studentVentureId.toString();
    const bucket = byVenture.get(key) ?? [];
    bucket.push(record);
    byVenture.set(key, bucket);
  }

  // Roll number and batch make the export usable as an administrative record.
  const { StudentProfile } = await import('@/models');
  const profiles = await StudentProfile.find({
    userId: {
      $in: ventures
        .map((venture) => venture.studentId?._id)
        .filter(Boolean)
        .map(String),
    },
  })
    .select('userId rollNumber batch')
    .lean()
    .exec();
  const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

  const count = (rows: typeof records, status: StudentActivityStatus) =>
    rows.filter((row) => row.status === status).length;

  const rows: StudentProgressRow[] = ventures
    .map((venture) => {
      const bucket = byVenture.get(venture._id.toString()) ?? [];
      const profile = venture.studentId
        ? profileByUser.get(venture.studentId._id?.toString() ?? '')
        : undefined;

      return {
        studentVentureId: venture._id.toString(),
        studentName: venture.studentId?.name ?? 'Unknown',
        studentEmail: venture.studentId?.email ?? '',
        rollNumber: profile?.rollNumber ?? null,
        batch: profile?.batch ?? null,
        ventureName: venture.ventureName,
        industry: venture.industry ?? null,
        ventureStatus: venture.status,
        facultyName: venture.facultyId?.name ?? null,
        mentorName: venture.mentorId?.name ?? null,
        completed: count(bucket, 'COMPLETED'),
        total: bucket.length,
        percentage: completionPercentage(bucket.map((row) => ({ order: 0, status: row.status }))),
        currentActivity: venture.currentVentureActivityId
          ? `${venture.currentVentureActivityId.activityCode} ${venture.currentVentureActivityId.name}`
          : null,
        notStarted: count(bucket, 'NOT_STARTED'),
        inProgress: count(bucket, 'IN_PROGRESS'),
        underReview: count(bucket, 'UNDER_REVIEW'),
        revisionRequired: count(bucket, 'REVISION_REQUIRED'),
        maxAttemptsReached: count(bucket, 'MAX_ATTEMPTS_REACHED'),
      };
    })
    // A batch filter is applied here because it lives on the profile, not the venture.
    .filter((row) => !filters.batch || row.batch === filters.batch);

  return sortRows(
    rows,
    filters.sortBy,
    filters.sortDir,
    (a, b) => b.percentage - a.percentage || a.studentName.localeCompare(b.studentName),
  );
}

// --------------------------------------------- Activity completion ----

export interface ActivityCompletionRow {
  activityCode: string;
  name: string;
  order: number;
  termName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  durationDays: number;
  maxAttempts: number;
  notStarted: number;
  inProgress: number;
  underReview: number;
  revisionRequired: number;
  completed: number;
  maxAttemptsReached: number;
  total: number;
  completionRate: number;
}

export async function getActivityCompletionReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<ActivityCompletionRow[]> {
  await connectToDatabase();

  const [ventureScope, activityScope] = await Promise.all([
    resolveVentureScope(filters),
    resolveActivityScope(filters),
  ]);

  const activityQuery: Record<string, unknown> = {};
  applyScope(activityQuery, '_id', activityScope);

  const activities = await VentureActivity.find(activityQuery)
    .populate<{ termId: { _id: unknown; name: string } | null }>('termId', 'name')
    .sort({ order: 1 })
    .lean()
    .exec();

  if (activities.length === 0) return [];

  const recordQuery: Record<string, unknown> = {
    ventureActivityId: { $in: activities.map((activity) => activity._id) },
  };
  applyScope(recordQuery, 'studentVentureId', ventureScope);

  const grouped = await StudentVentureActivity.aggregate<{
    _id: { ventureActivityId: unknown; status: StudentActivityStatus };
    count: number;
  }>([
    { $match: recordQuery },
    {
      $group: {
        _id: { ventureActivityId: '$ventureActivityId', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]).exec();

  const counts = new Map<string, Map<StudentActivityStatus, number>>();
  for (const row of grouped) {
    const key = String(row._id.ventureActivityId);
    const bucket = counts.get(key) ?? new Map<StudentActivityStatus, number>();
    bucket.set(row._id.status, row.count);
    counts.set(key, bucket);
  }

  const rows: ActivityCompletionRow[] = activities.map((activity) => {
    const bucket = counts.get(activity._id.toString()) ?? new Map<StudentActivityStatus, number>();
    const get = (status: StudentActivityStatus) => bucket.get(status) ?? 0;
    const total = [...bucket.values()].reduce((sum, value) => sum + value, 0);
    const completed = get('COMPLETED');

    return {
      activityCode: activity.activityCode,
      name: activity.name,
      order: activity.order,
      termName: activity.termId?.name ?? null,
      startDate: activity.startDate ?? null,
      endDate: activity.endDate ?? null,
      durationDays: activity.durationDays,
      maxAttempts: activity.maxAttempts,
      notStarted: get('NOT_STARTED'),
      inProgress: get('IN_PROGRESS'),
      underReview: get('UNDER_REVIEW'),
      revisionRequired: get('REVISION_REQUIRED'),
      completed,
      maxAttemptsReached: get('MAX_ATTEMPTS_REACHED'),
      total,
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  });

  return sortRows(rows, filters.sortBy, filters.sortDir, (a, b) => a.order - b.order);
}

// ------------------------------------------------- Review summary ----

export interface ReviewSummaryRow {
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewerType: 'FACULTY' | 'MENTOR';
  approved: number;
  revisionRequired: number;
  rejected: number;
  total: number;
  pending: number;
  lastReviewedAt: Date | null;
}

export async function getReviewSummaryReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<ReviewSummaryRow[]> {
  await connectToDatabase();

  const reviewMatch: Record<string, unknown> = {};
  if (filters.reviewerType) reviewMatch.reviewerType = filters.reviewerType;
  if (filters.reviewStatus) reviewMatch.status = filters.reviewStatus;

  const reviewedAt = dateRangeClause(filters);
  if (reviewedAt) reviewMatch.reviewedAt = reviewedAt;

  // A named faculty/mentor filter narrows to that reviewer.
  const reviewerIds = [filters.facultyId, filters.mentorId].filter(Boolean);
  if (reviewerIds.length > 0) reviewMatch.reviewerId = { $in: reviewerIds };

  const grouped = await Review.aggregate<{
    _id: { reviewerId: unknown; reviewerType: 'FACULTY' | 'MENTOR'; status: ReviewStatus };
    count: number;
    lastReviewedAt: Date;
  }>([
    { $match: reviewMatch },
    {
      $group: {
        _id: { reviewerId: '$reviewerId', reviewerType: '$reviewerType', status: '$status' },
        count: { $sum: 1 },
        lastReviewedAt: { $max: '$reviewedAt' },
      },
    },
  ]).exec();

  // Outstanding work comes from the assignment side, not the review log.
  const pendingFacultyMatch: Record<string, unknown> = {
    status: 'UNDER_REVIEW',
    facultyReviewStatus: 'PENDING',
    facultyId: { $ne: null },
  };
  const pendingMentorMatch: Record<string, unknown> = {
    status: 'UNDER_REVIEW',
    mentorReviewStatus: 'PENDING',
    mentorId: { $ne: null },
  };

  if (filters.facultyId) pendingFacultyMatch.facultyId = filters.facultyId;
  if (filters.mentorId) pendingMentorMatch.mentorId = filters.mentorId;

  const activityScope = await resolveActivityScope(filters);
  applyScope(pendingFacultyMatch, 'ventureActivityId', activityScope);
  applyScope(pendingMentorMatch, 'ventureActivityId', activityScope);

  const wantFaculty = !filters.reviewerType || filters.reviewerType === 'FACULTY';
  const wantMentor = !filters.reviewerType || filters.reviewerType === 'MENTOR';

  const [facultyPending, mentorPending] = await Promise.all([
    wantFaculty
      ? StudentVentureActivity.aggregate<{ _id: unknown; count: number }>([
          { $match: pendingFacultyMatch },
          { $group: { _id: '$facultyId', count: { $sum: 1 } } },
        ]).exec()
      : Promise.resolve([]),
    wantMentor
      ? StudentVentureActivity.aggregate<{ _id: unknown; count: number }>([
          { $match: pendingMentorMatch },
          { $group: { _id: '$mentorId', count: { $sum: 1 } } },
        ]).exec()
      : Promise.resolve([]),
  ]);

  const pendingByKey = new Map<string, number>();
  for (const row of facultyPending) pendingByKey.set(`${String(row._id)}:FACULTY`, row.count);
  for (const row of mentorPending) pendingByKey.set(`${String(row._id)}:MENTOR`, row.count);

  const rows = new Map<string, ReviewSummaryRow>();

  const ensure = (reviewerId: string, reviewerType: 'FACULTY' | 'MENTOR'): ReviewSummaryRow => {
    const key = `${reviewerId}:${reviewerType}`;
    const existing = rows.get(key);
    if (existing) return existing;

    const created: ReviewSummaryRow = {
      reviewerId,
      reviewerName: 'Unknown',
      reviewerEmail: '',
      reviewerType,
      approved: 0,
      revisionRequired: 0,
      rejected: 0,
      total: 0,
      pending: pendingByKey.get(key) ?? 0,
      lastReviewedAt: null,
    };
    rows.set(key, created);
    return created;
  };

  for (const row of grouped) {
    const entry = ensure(String(row._id.reviewerId), row._id.reviewerType);

    if (row._id.status === 'APPROVED') entry.approved += row.count;
    else if (row._id.status === 'REVISION_REQUIRED') entry.revisionRequired += row.count;
    else if (row._id.status === 'REJECTED') entry.rejected += row.count;

    entry.total += row.count;

    if (!entry.lastReviewedAt || row.lastReviewedAt > entry.lastReviewedAt) {
      entry.lastReviewedAt = row.lastReviewedAt;
    }
  }

  // Reviewers with outstanding work but no completed reviews still belong here.
  for (const [key] of pendingByKey) {
    const [reviewerId, reviewerType] = key.split(':') as [string, 'FACULTY' | 'MENTOR'];
    ensure(reviewerId, reviewerType);
  }

  const reviewers = await User.find({ _id: { $in: [...rows.values()].map((r) => r.reviewerId) } })
    .select('name email')
    .lean()
    .exec();
  const byId = new Map(reviewers.map((user) => [user._id.toString(), user]));

  for (const row of rows.values()) {
    const user = byId.get(row.reviewerId);
    row.reviewerName = user?.name ?? 'Unknown';
    row.reviewerEmail = user?.email ?? '';
  }

  return sortRows(
    [...rows.values()],
    filters.sortBy,
    filters.sortDir,
    (a, b) => b.pending - a.pending || a.reviewerName.localeCompare(b.reviewerName),
  );
}

// ------------------------------------------- Attempts and revisions ----

export interface AttemptsReportRow {
  studentName: string;
  studentEmail: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptsUsed: number;
  maxAttempts: number;
  attemptsRemaining: number;
  status: StudentActivityStatus;
  facultyReviewStatus: string;
  mentorReviewStatus: string;
  submissions: number;
  facultyName: string | null;
  mentorName: string | null;
  lastUpdatedAt: Date;
  completedAt: Date | null;
}

export async function getAttemptsReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<AttemptsReportRow[]> {
  await connectToDatabase();

  const [ventureScope, activityScope] = await Promise.all([
    resolveVentureScope(filters),
    resolveActivityScope(filters),
  ]);

  const recordQuery: Record<string, unknown> = { attemptNumber: { $gt: 0 } };
  applyScope(recordQuery, 'studentVentureId', ventureScope);
  applyScope(recordQuery, 'ventureActivityId', activityScope);
  if (filters.activityStatus) recordQuery.status = filters.activityStatus;

  const updatedAt = dateRangeClause(filters);
  if (updatedAt) recordQuery.updatedAt = updatedAt;

  const records = await StudentVentureActivity.find(recordQuery)
    .sort({ updatedAt: -1 })
    .limit(filters.limit ?? 5_000)
    .lean()
    .exec();

  if (records.length === 0) return [];

  const [activities, ventures, submissionCounts] = await Promise.all([
    VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
      .select('activityCode name maxAttempts order')
      .lean()
      .exec(),
    StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
      .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
        'studentId',
        'name email',
      )
      .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
      .populate<{ mentorId: { _id: unknown; name: string } | null }>('mentorId', 'name')
      .select('ventureName studentId facultyId mentorId')
      .lean()
      .exec(),
    VentureSubmission.aggregate<{ _id: unknown; count: number }>([
      { $match: { studentVentureActivityId: { $in: records.map((r) => r._id) } } },
      { $group: { _id: '$studentVentureActivityId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
  const submissionsById = new Map(submissionCounts.map((s) => [String(s._id), s.count]));

  const rows = records
    .map((record): AttemptsReportRow | null => {
      const activity = activityById.get(record.ventureActivityId.toString());
      const venture = ventureById.get(record.studentVentureId.toString());
      if (!activity || !venture) return null;

      return {
        studentName: venture.studentId?.name ?? 'Unknown',
        studentEmail: venture.studentId?.email ?? '',
        ventureName: venture.ventureName,
        activityCode: activity.activityCode,
        activityName: activity.name,
        attemptsUsed: record.attemptNumber,
        maxAttempts: activity.maxAttempts,
        attemptsRemaining: Math.max(0, activity.maxAttempts - record.attemptNumber),
        status: record.status,
        facultyReviewStatus: record.facultyReviewStatus,
        mentorReviewStatus: record.mentorReviewStatus,
        submissions: submissionsById.get(record._id.toString()) ?? 0,
        facultyName: venture.facultyId?.name ?? null,
        mentorName: venture.mentorId?.name ?? null,
        lastUpdatedAt: record.updatedAt,
        completedAt: record.completedAt ?? null,
      };
    })
    .filter((row): row is AttemptsReportRow => row !== null);

  return sortRows(
    rows,
    filters.sortBy,
    filters.sortDir,
    (a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime(),
  );
}

// --------------------------------------------------- Venture progress ----

export interface VentureProgressRow {
  ventureName: string;
  ventureTitle: string | null;
  studentName: string;
  industry: string | null;
  targetMarket: string | null;
  fundingStatus: string | null;
  status: string;
  facultyName: string | null;
  mentorName: string | null;
  completed: number;
  total: number;
  percentage: number;
}

export async function getVentureProgressReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<VentureProgressRow[]> {
  const progress = await getStudentProgressReport(filters);
  await connectToDatabase();

  const ventures = await StudentVenture.find({
    _id: { $in: progress.map((row) => row.studentVentureId) },
  })
    .select('ventureName ventureTitle industry targetMarket fundingStatus status')
    .lean()
    .exec();

  const metaById = new Map(ventures.map((venture) => [venture._id.toString(), venture]));

  const rows: VentureProgressRow[] = progress.map((row) => {
    const meta = metaById.get(row.studentVentureId);
    return {
      ventureName: row.ventureName,
      ventureTitle: meta?.ventureTitle ?? null,
      studentName: row.studentName,
      industry: meta?.industry ?? null,
      targetMarket: meta?.targetMarket ?? null,
      fundingStatus: meta?.fundingStatus ?? null,
      status: meta?.status ?? 'ACTIVE',
      facultyName: row.facultyName,
      mentorName: row.mentorName,
      completed: row.completed,
      total: row.total,
      percentage: row.percentage,
    };
  });

  return sortRows(
    rows,
    filters.sortBy,
    filters.sortDir,
    (a, b) => b.percentage - a.percentage || a.ventureName.localeCompare(b.ventureName),
  );
}

// ------------------------------------------------------- Review log ----

export interface ReviewLogRow {
  reviewedAt: Date;
  reviewerName: string;
  reviewerType: string;
  decision: string;
  studentName: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  comments: string | null;
}

/** The immutable review history, flattened for audit and export. */
export async function getReviewLogReport(
  filters: ReportFilters = NO_FILTERS,
): Promise<ReviewLogRow[]> {
  await connectToDatabase();

  const match: Record<string, unknown> = {};
  if (filters.reviewerType) match.reviewerType = filters.reviewerType;
  if (filters.reviewStatus) match.status = filters.reviewStatus;

  const reviewedAt = dateRangeClause(filters);
  if (reviewedAt) match.reviewedAt = reviewedAt;

  const reviewerIds = [filters.facultyId, filters.mentorId].filter(Boolean);
  if (reviewerIds.length > 0) match.reviewerId = { $in: reviewerIds };

  const reviews = await Review.find(match)
    .populate<{ reviewerId: { _id: unknown; name: string } | null }>('reviewerId', 'name')
    .sort({ reviewedAt: -1 })
    .limit(filters.limit ?? 5_000)
    .lean()
    .exec();

  if (reviews.length === 0) return [];

  const submissions = await VentureSubmission.find({
    _id: { $in: reviews.map((review) => review.submissionId) },
  })
    .select('studentVentureActivityId attemptNumber')
    .lean()
    .exec();
  const submissionById = new Map(submissions.map((s) => [s._id.toString(), s]));

  const records = await StudentVentureActivity.find({
    _id: { $in: submissions.map((s) => s.studentVentureActivityId) },
  })
    .select('studentVentureId ventureActivityId')
    .lean()
    .exec();
  const recordById = new Map(records.map((r) => [r._id.toString(), r]));

  const [ventures, activities] = await Promise.all([
    StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
      .populate<{ studentId: { _id: unknown; name: string } | null }>('studentId', 'name')
      .select('ventureName studentId')
      .lean()
      .exec(),
    VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
      .select('activityCode name termId')
      .lean()
      .exec(),
  ]);

  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));

  const activityScope = await resolveActivityScope(filters);
  const activityAllowed = activityScope ? new Set(activityScope.map((id) => id.toString())) : null;

  const ventureScope = await resolveVentureScope(filters);
  const ventureAllowed = ventureScope ? new Set(ventureScope.map((id) => id.toString())) : null;

  const rows = reviews
    .map((review): ReviewLogRow | null => {
      const submission = submissionById.get(review.submissionId.toString());
      if (!submission) return null;

      const record = recordById.get(submission.studentVentureActivityId.toString());
      if (!record) return null;

      const ventureKey = record.studentVentureId.toString();
      const activityKey = record.ventureActivityId.toString();

      if (ventureAllowed && !ventureAllowed.has(ventureKey)) return null;
      if (activityAllowed && !activityAllowed.has(activityKey)) return null;

      const venture = ventureById.get(ventureKey);
      const activity = activityById.get(activityKey);
      if (!venture || !activity) return null;

      return {
        reviewedAt: review.reviewedAt,
        reviewerName: review.reviewerId?.name ?? 'Unknown',
        reviewerType: review.reviewerType,
        decision: review.status,
        studentName: venture.studentId?.name ?? 'Unknown',
        ventureName: venture.ventureName,
        activityCode: activity.activityCode,
        activityName: activity.name,
        attemptNumber: submission.attemptNumber,
        comments: review.comments ?? null,
      };
    })
    .filter((row): row is ReviewLogRow => row !== null);

  return sortRows(
    rows,
    filters.sortBy,
    filters.sortDir,
    (a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime(),
  );
}
