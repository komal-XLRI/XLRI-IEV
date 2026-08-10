import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentVenture, StudentVentureActivity, User, VentureActivity } from '@/models';
import type { ReviewStatus, ReviewerType } from '@/lib/constants/status';

export interface PendingReviewerRow {
  reviewerId: string;
  reviewerName: string;
  reviewerType: ReviewerType;
  pending: number;
}

/** Who still owes a verdict, and how many. Drives the admin dashboard. */
export async function getReviewQueueSummary(): Promise<PendingReviewerRow[]> {
  await connectToDatabase();

  const [faculty, mentor] = await Promise.all([
    StudentVentureActivity.aggregate<{ _id: unknown; count: number }>([
      {
        $match: {
          status: 'UNDER_REVIEW',
          facultyReviewStatus: 'PENDING',
          facultyId: { $ne: null },
        },
      },
      { $group: { _id: '$facultyId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec(),
    StudentVentureActivity.aggregate<{ _id: unknown; count: number }>([
      {
        $match: { status: 'UNDER_REVIEW', mentorReviewStatus: 'PENDING', mentorId: { $ne: null } },
      },
      { $group: { _id: '$mentorId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec(),
  ]);

  const rows = [
    ...faculty.map((r) => ({
      reviewerId: String(r._id),
      reviewerType: 'FACULTY' as const,
      pending: r.count,
    })),
    ...mentor.map((r) => ({
      reviewerId: String(r._id),
      reviewerType: 'MENTOR' as const,
      pending: r.count,
    })),
  ];

  if (rows.length === 0) return [];

  const users = await User.find({ _id: { $in: rows.map((r) => r.reviewerId) } })
    .select('name')
    .lean()
    .exec();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return rows
    .map((row) => ({ ...row, reviewerName: nameById.get(row.reviewerId) ?? 'Unknown' }))
    .sort((a, b) => b.pending - a.pending);
}

export interface HeaderAlert {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'info' | 'warning' | 'danger';
}

/**
 * What the signed-in user needs to act on, for the header bell.
 *
 * Deliberately derived from the records that already exist rather than backed
 * by a notifications collection: there is nothing to write, nothing to mark as
 * read, and nothing that can drift out of step with the underlying state. Each
 * entry is a count plus the link that resolves it.
 *
 * Kept to counted queries on already-indexed fields, because this runs on every
 * page render for every role.
 */
export async function getHeaderAlerts(user: {
  userId: string;
  role: 'ADMIN' | 'STUDENT' | 'FACULTY' | 'MENTOR';
}): Promise<HeaderAlert[]> {
  await connectToDatabase();

  const alerts: HeaderAlert[] = [];

  if (user.role === 'ADMIN') {
    const [awaitingReview, unassigned, exhausted] = await Promise.all([
      StudentVentureActivity.countDocuments({ status: 'UNDER_REVIEW' }).exec(),
      StudentVenture.countDocuments({ $or: [{ facultyId: null }, { mentorId: null }] }).exec(),
      StudentVentureActivity.countDocuments({ status: 'MAX_ATTEMPTS_REACHED' }).exec(),
    ]);

    if (awaitingReview > 0) {
      alerts.push({
        id: 'awaiting-review',
        title: `${awaitingReview} attempt${awaitingReview === 1 ? '' : 's'} awaiting review`,
        detail: 'Both a faculty and a mentor verdict are required to complete an activity.',
        href: '/admin/reviews',
        tone: 'info',
      });
    }

    if (unassigned > 0) {
      alerts.push({
        id: 'unassigned',
        title: `${unassigned} venture${unassigned === 1 ? '' : 's'} without a full review pair`,
        detail: 'A venture cannot be reviewed until both a faculty and a mentor are assigned.',
        href: '/admin/ventures',
        tone: 'warning',
      });
    }

    if (exhausted > 0) {
      alerts.push({
        id: 'max-attempts',
        title: `${exhausted} activit${exhausted === 1 ? 'y has' : 'ies have'} run out of attempts`,
        detail: 'These students are blocked until the attempt limit is raised.',
        href: '/admin/reviews',
        tone: 'danger',
      });
    }

    return alerts;
  }

  if (user.role === 'FACULTY' || user.role === 'MENTOR') {
    const field = user.role === 'FACULTY' ? 'facultyReviewStatus' : 'mentorReviewStatus';
    const owner = user.role === 'FACULTY' ? 'facultyId' : 'mentorId';

    const pending = await StudentVentureActivity.countDocuments({
      status: 'UNDER_REVIEW',
      [owner]: user.userId,
      [field]: 'PENDING',
    }).exec();

    return pending > 0
      ? [
          {
            id: 'my-queue',
            title: `${pending} submission${pending === 1 ? '' : 's'} awaiting your verdict`,
            detail: 'The activity stays under review until you and the other reviewer both decide.',
            href: user.role === 'FACULTY' ? '/faculty' : '/mentor',
            tone: 'info',
          },
        ]
      : [];
  }

  const [revisions, blocked] = await Promise.all([
    StudentVentureActivity.countDocuments({
      studentId: user.userId,
      status: 'REVISION_REQUIRED',
    }).exec(),
    StudentVentureActivity.countDocuments({
      studentId: user.userId,
      status: 'MAX_ATTEMPTS_REACHED',
    }).exec(),
  ]);

  if (revisions > 0) {
    alerts.push({
      id: 'revisions',
      title: `${revisions} activit${revisions === 1 ? 'y needs' : 'ies need'} revision`,
      detail: 'A reviewer asked for changes. Submit a revised attempt to continue.',
      href: '/student',
      tone: 'warning',
    });
  }

  if (blocked > 0) {
    alerts.push({
      id: 'blocked',
      title: `${blocked} activit${blocked === 1 ? 'y has' : 'ies have'} no attempts left`,
      detail: 'Contact the programme office — an administrator has to raise the limit.',
      href: '/student',
      tone: 'danger',
    });
  }

  return alerts;
}

export interface PendingReviewAttempt {
  recordId: string;
  studentName: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  maxAttempts: number;
  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  /** When the record last changed — i.e. when it entered review. The
   * submission timestamp itself lives on VentureSubmission. */
  awaitingSince: string;
}

/**
 * Attempts sitting under review, across the whole cohort.
 *
 * The reviewer-facing queue in `reviewService` is scoped to one reviewer by
 * design, so it cannot answer the administrator's question — "what is waiting,
 * anywhere?". This is that read, and only that: no verdicts, no state changes,
 * no rules. Both per-reviewer verdicts come back so the dual-review requirement
 * stays visible in the list rather than being collapsed into one status.
 */
export async function getPendingReviewAttempts(limit = 25): Promise<PendingReviewAttempt[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ status: 'UNDER_REVIEW' })
    .select(
      'studentId studentVentureId ventureActivityId attemptNumber facultyReviewStatus mentorReviewStatus updatedAt',
    )
    .populate<{ studentId: { name: string } | null }>('studentId', 'name')
    .populate<{ studentVentureId: { ventureName: string } | null }>(
      'studentVentureId',
      'ventureName',
    )
    .populate<{
      ventureActivityId: { activityCode: string; name: string; maxAttempts: number } | null;
    }>('ventureActivityId', 'activityCode name maxAttempts')
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean()
    .exec();

  return records.map((record) => ({
    recordId: record._id.toString(),
    studentName: record.studentId?.name ?? 'Unknown student',
    ventureName: record.studentVentureId?.ventureName ?? '—',
    activityCode: record.ventureActivityId?.activityCode ?? '—',
    activityName: record.ventureActivityId?.name ?? '—',
    attemptNumber: record.attemptNumber,
    maxAttempts: record.ventureActivityId?.maxAttempts ?? 0,
    facultyReviewStatus: record.facultyReviewStatus,
    mentorReviewStatus: record.mentorReviewStatus,
    awaitingSince: record.updatedAt.toISOString(),
  }));
}

/** Total under review, for "showing N of M" without loading every record. */
export async function countPendingReviewAttempts(): Promise<number> {
  await connectToDatabase();
  return StudentVentureActivity.countDocuments({ status: 'UNDER_REVIEW' }).exec();
}

export interface ReviewerDashboard {
  assignedVentures: number;
  pendingReviews: number;
  approvedByMe: number;
  revisionsRequested: number;
}

/** Timeline of upcoming and current Venture Activity windows. */
export async function getActivityCalendar() {
  await connectToDatabase();

  const activities = await VentureActivity.find({ status: 'ACTIVE' })
    .select('activityCode name order startDate endDate durationDays maxAttempts termId')
    .sort({ order: 1 })
    .lean()
    .exec();

  return activities;
}
