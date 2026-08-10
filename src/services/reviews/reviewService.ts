import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  Review,
  StudentVenture,
  StudentVentureActivity,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '@/lib/errors';
import { canReview } from '@/lib/permissions/reviewAccess';
import { resolveActivityStatus } from '@/lib/rules/dualReview';
import { refreshCurrentActivity } from '@/services/ventures/studentVentureService';
import type { Role } from '@/lib/constants/roles';
import type { ReviewerType } from '@/lib/constants/status';
import type { CreateReviewInput } from '@/validators/submissions';
import { logger } from '@/lib/logger';

/**
 * Records one reviewer's verdict on one submission and recomputes the
 * activity's overall status.
 *
 * The reviewer type comes from the caller's authenticated role — never from
 * the request — so Faculty can never file a Mentor review or vice versa.
 */
export async function createReview(
  input: CreateReviewInput,
  reviewer: { userId: string; role: Role },
) {
  await connectToDatabase();

  const submission = await VentureSubmission.findById(input.submissionId).lean().exec();
  if (!submission) throw new NotFoundError('Submission not found');

  const record = await StudentVentureActivity.findById(submission.studentVentureActivityId)
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const [venture, activity] = await Promise.all([
    StudentVenture.findById(record.studentVentureId).lean().exec(),
    VentureActivity.findById(record.ventureActivityId).lean().exec(),
  ]);
  if (!venture) throw new NotFoundError('Venture not found');
  if (!activity) throw new NotFoundError('Venture activity not found');

  const permission = canReview(
    reviewer.role,
    { facultyId: venture.facultyId, mentorId: venture.mentorId },
    reviewer.userId,
  );
  if (!permission.allowed || !permission.reviewerType) {
    throw new ForbiddenError(permission.reason ?? 'You cannot review this submission');
  }
  const reviewerType: ReviewerType = permission.reviewerType;

  // Only the newest attempt is reviewable — an old attempt's verdict is history.
  if (submission.attemptNumber !== record.attemptNumber) {
    throw new RuleViolationError(
      'This attempt has been superseded by a newer submission and can no longer be reviewed.',
    );
  }

  const already = await Review.findOne({ submissionId: input.submissionId, reviewerType })
    .select('_id')
    .lean()
    .exec();
  if (already) {
    throw new ConflictError(
      `A ${reviewerType.toLowerCase()} review already exists for this attempt.`,
    );
  }

  return withTransaction(async (session) => {
    const [review] = await Review.create(
      [
        {
          submissionId: input.submissionId,
          reviewerId: reviewer.userId,
          reviewerType,
          status: input.status,
          comments: input.comments || undefined,
          reviewedAt: new Date(),
        },
      ],
      { session: session ?? undefined },
    );

    const facultyReviewStatus =
      reviewerType === 'FACULTY' ? input.status : record.facultyReviewStatus;
    const mentorReviewStatus = reviewerType === 'MENTOR' ? input.status : record.mentorReviewStatus;

    // Dual review: COMPLETED requires BOTH approvals. One approval alone
    // leaves the activity UNDER_REVIEW and advances nothing.
    const nextStatus = resolveActivityStatus({
      facultyReviewStatus,
      mentorReviewStatus,
      attemptsUsed: record.attemptNumber,
      maxAttempts: activity.maxAttempts,
    });

    const reviewerSnapshot =
      reviewerType === 'FACULTY'
        ? { reviewFacultyId: reviewer.userId }
        : { reviewMentorId: reviewer.userId };

    await StudentVentureActivity.updateOne(
      { _id: record._id },
      {
        $set: {
          facultyReviewStatus,
          mentorReviewStatus,
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
          ...reviewerSnapshot,
        },
      },
      sessionOption(session),
    ).exec();

    // The venture pointer only moves once an activity is genuinely COMPLETED.
    await refreshCurrentActivity(record.studentVentureId.toString(), session);

    logger.info('Review recorded', {
      reviewId: review!._id.toString(),
      reviewerType,
      decision: input.status,
      activityStatus: nextStatus,
    });

    return {
      reviewId: review!._id.toString(),
      reviewerType,
      facultyReviewStatus,
      mentorReviewStatus,
      activityStatus: nextStatus,
    };
  });
}

// ------------------------------------------------------- Review queues ----

export interface ReviewQueueFilters {
  /** 'PENDING' shows only what this reviewer still owes a verdict on. */
  state?: 'PENDING' | 'APPROVED' | 'REVISION_REQUIRED' | 'ALL';
}

/**
 * What a reviewer still has to act on: activities under review where *their*
 * verdict is still PENDING.
 */
export async function getReviewQueue(
  reviewer: { userId: string; role: Role },
  filters: ReviewQueueFilters = {},
) {
  await connectToDatabase();

  const reviewerType: ReviewerType | null =
    reviewer.role === 'FACULTY' ? 'FACULTY' : reviewer.role === 'MENTOR' ? 'MENTOR' : null;
  if (!reviewerType) return [];

  const assignmentField = reviewerType === 'FACULTY' ? 'facultyId' : 'mentorId';
  const statusField = reviewerType === 'FACULTY' ? 'facultyReviewStatus' : 'mentorReviewStatus';

  const ventures = await StudentVenture.find({ [assignmentField]: reviewer.userId })
    .select('_id')
    .lean()
    .exec();
  const ventureIds = ventures.map((v) => v._id);
  if (ventureIds.length === 0) return [];

  const filter: Record<string, unknown> = {
    studentVentureId: { $in: ventureIds },
    attemptNumber: { $gt: 0 },
  };

  const state = filters.state ?? 'PENDING';
  if (state === 'PENDING') {
    filter[statusField] = 'PENDING';
    filter.status = 'UNDER_REVIEW';
  } else if (state !== 'ALL') {
    filter[statusField] = state;
  }

  const records = await StudentVentureActivity.find(filter)
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean()
    .exec();

  if (records.length === 0) return [];

  const [activities, venturesFull, submissions] = await Promise.all([
    VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
      .lean()
      .exec(),
    StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
      .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
        'studentId',
        'name email',
      )
      .lean()
      .exec(),
    VentureSubmission.find({
      _id: {
        $in: records
          .map((r) => r.currentSubmissionId)
          .filter((id): id is NonNullable<typeof id> => Boolean(id)),
      },
    })
      .lean()
      .exec(),
  ]);

  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
  const ventureById = new Map(venturesFull.map((v) => [v._id.toString(), v]));
  const submissionById = new Map(submissions.map((s) => [s._id.toString(), s]));

  return records
    .map((record) => {
      const activity = activityById.get(record.ventureActivityId.toString());
      const venture = ventureById.get(record.studentVentureId.toString());
      if (!activity || !venture) return null;

      return {
        record,
        activity,
        venture,
        submission: record.currentSubmissionId
          ? (submissionById.get(record.currentSubmissionId.toString()) ?? null)
          : null,
        myReviewStatus:
          reviewerType === 'FACULTY' ? record.facultyReviewStatus : record.mentorReviewStatus,
        otherReviewStatus:
          reviewerType === 'FACULTY' ? record.mentorReviewStatus : record.facultyReviewStatus,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

/** Admin view across every reviewer. */
export async function getAllReviews(filters: {
  reviewerType?: ReviewerType;
  status?: string;
  limit?: number;
}) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (filters.reviewerType) filter.reviewerType = filters.reviewerType;
  if (filters.status) filter.status = filters.status;

  return Review.find(filter)
    .populate<{ reviewerId: { _id: unknown; name: string; email: string } }>(
      'reviewerId',
      'name email',
    )
    .sort({ reviewedAt: -1 })
    .limit(filters.limit ?? 200)
    .lean()
    .exec();
}

export async function getReviewsForSubmission(submissionId: string) {
  await connectToDatabase();
  return Review.find({ submissionId })
    .populate<{ reviewerId: { _id: unknown; name: string } }>('reviewerId', 'name')
    .sort({ reviewedAt: 1 })
    .lean()
    .exec();
}

/** Prior feedback across earlier attempts — shown to reviewers for context. */
export async function getPreviousFeedback(studentVentureActivityId: string) {
  await connectToDatabase();

  const submissions = await VentureSubmission.find({ studentVentureActivityId })
    .select('_id attemptNumber')
    .sort({ attemptNumber: 1 })
    .lean()
    .exec();

  if (submissions.length === 0) return [];

  const reviews = await Review.find({ submissionId: { $in: submissions.map((s) => s._id) } })
    .populate<{ reviewerId: { _id: unknown; name: string } }>('reviewerId', 'name')
    .sort({ reviewedAt: 1 })
    .lean()
    .exec();

  const attemptBySubmission = new Map(submissions.map((s) => [s._id.toString(), s.attemptNumber]));

  return reviews.map((review) => ({
    ...review,
    attemptNumber: attemptBySubmission.get(review.submissionId.toString()) ?? 0,
  }));
}
