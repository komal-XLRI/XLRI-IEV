import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Types } from 'mongoose';
import {
  Presentation,
  PresentationParticipant,
  StudentVentureActivity,
  User,
  VentureActivity,
} from '@/models';
import { startOfTodayUtc } from '@/lib/utils/dates';
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
 * These are live, not stored: each one is worked out from the records as they
 * are now, so it disappears by itself once dealt with. Things that *happened*
 * — feedback in, a stage completed — are stored notifications instead (see
 * notificationService); this is only what still needs doing.
 *
 * Kept to a few small queries, because this runs on every page render.
 */
export async function getHeaderAlerts(user: {
  userId: string;
  role: 'ADMIN' | 'STUDENT' | 'FACULTY' | 'MENTOR';
}): Promise<HeaderAlert[]> {
  await connectToDatabase();

  const alerts: HeaderAlert[] = [];
  const today = startOfTodayUtc();

  if (user.role === 'ADMIN') {
    const [todays, withoutForm] = await Promise.all([
      Presentation.find({ presentedOn: today, status: 'SCHEDULED' })
        .select('ventureActivityId')
        .lean()
        .exec(),
      Presentation.find({ status: { $ne: 'CANCELLED' }, feedbackForm: null })
        .select('_id ventureActivityId')
        .lean()
        .exec(),
    ]);

    if (todays.length > 0) {
      const stages = new Set(todays.map((p) => p.ventureActivityId.toString()));
      alerts.push({
        id: 'presentations-today',
        title: `${todays.length} presentation${todays.length === 1 ? '' : 's'} today`,
        detail: 'Mark each student received once they have presented, so their QR code works.',
        href:
          stages.size === 1
            ? `/admin/venture-activities/${[...stages][0]}`
            : '/admin/venture-activities',
        tone: 'info',
      });
    }

    // A received student's QR code leads nowhere until their presentation has
    // a feedback form — mentors scanning it are turned away.
    const blocked = withoutForm.length
      ? await PresentationParticipant.distinct('presentationId', {
          presentationId: { $in: withoutForm.map((p) => p._id) },
          receivedAt: { $ne: null },
        }).exec()
      : [];
    if (blocked.length > 0) {
      const blockedIds = new Set(blocked.map((id) => id.toString()));
      const stages = new Set(
        withoutForm
          .filter((p) => blockedIds.has(p._id.toString()))
          .map((p) => p.ventureActivityId.toString()),
      );
      alerts.push({
        id: 'presentations-without-form',
        title: `${blocked.length} presentation${blocked.length === 1 ? '' : 's'} without a feedback form`,
        detail:
          'Students are marked received, but mentors cannot give feedback until a form is set up.',
        href:
          stages.size === 1
            ? `/admin/venture-activities/${[...stages][0]}`
            : '/admin/venture-activities',
        tone: 'warning',
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

  // A student's one deadline: a presentation today or tomorrow.
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const mine = await PresentationParticipant.find({
    studentId: new Types.ObjectId(user.userId),
    receivedAt: null,
  })
    .select('presentationId studentVentureActivityId')
    .lean()
    .exec();
  if (mine.length > 0) {
    const soon = await Presentation.find({
      _id: { $in: mine.map((p) => p.presentationId) },
      status: 'SCHEDULED',
      presentedOn: { $in: [today, tomorrow] },
    })
      .select('_id presentedOn startTime ventureActivityId')
      .sort({ presentedOn: 1, startTime: 1 })
      .lean()
      .exec();
    for (const presentation of soon) {
      const participant = mine.find((p) => p.presentationId.equals(presentation._id))!;
      const stage = await VentureActivity.findById(presentation.ventureActivityId)
        .select('activityCode name')
        .lean()
        .exec();
      const isToday = presentation.presentedOn.getTime() === today.getTime();
      alerts.push({
        id: `presentation-${presentation._id.toString()}`,
        title: `Your presentation is ${isToday ? 'today' : 'tomorrow'}${
          presentation.startTime ? ` at ${presentation.startTime}` : ''
        }`,
        detail: stage ? `${stage.activityCode} · ${stage.name}` : 'See your timeline for details.',
        href: `/student/activities/${participant.studentVentureActivityId.toString()}`,
        tone: isToday ? 'warning' : 'info',
      });
    }
  }
  return alerts;
}

export interface PendingReviewAttempt {
  recordId: string;
  /** The attempt itself, so an administrator can act on the row. Null if the
   * record is under review with no current submission, which is a data fault
   * rather than a state the workflow produces. */
  submissionId: string | null;
  studentName: string;
  ventureName: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  /** Who a verdict would be attributed to. Null when nobody is assigned. */
  facultyName: string | null;
  mentorName: string | null;
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

  // The student is reached through the venture — an activity record has no
  // `studentId` of its own, so the name comes from a nested populate.
  const records = await StudentVentureActivity.find({ status: 'UNDER_REVIEW' })
    .select(
      'studentVentureId ventureActivityId currentSubmissionId attemptNumber facultyReviewStatus mentorReviewStatus updatedAt',
    )
    .populate<{
      studentVentureId: {
        ventureName: string;
        studentId: { name: string } | null;
        facultyId: { name: string } | null;
        mentorId: { name: string } | null;
      } | null;
    }>({
      path: 'studentVentureId',
      select: 'ventureName studentId facultyId mentorId',
      populate: [
        { path: 'studentId', select: 'name' },
        { path: 'facultyId', select: 'name' },
        { path: 'mentorId', select: 'name' },
      ],
    })
    .populate<{
      ventureActivityId: { activityCode: string; name: string } | null;
    }>('ventureActivityId', 'activityCode name')
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean()
    .exec();

  return records.map((record) => ({
    recordId: record._id.toString(),
    submissionId: record.currentSubmissionId?.toString() ?? null,
    studentName: record.studentVentureId?.studentId?.name ?? 'Unknown student',
    ventureName: record.studentVentureId?.ventureName ?? '—',
    activityCode: record.ventureActivityId?.activityCode ?? '—',
    activityName: record.ventureActivityId?.name ?? '—',
    attemptNumber: record.attemptNumber,
    facultyReviewStatus: record.facultyReviewStatus,
    mentorReviewStatus: record.mentorReviewStatus,
    facultyName: record.studentVentureId?.facultyId?.name ?? null,
    mentorName: record.studentVentureId?.mentorId?.name ?? null,
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
    .select('activityCode name order startDate endDate durationDays termId')
    .sort({ order: 1 })
    .lean()
    .exec();

  return activities;
}
