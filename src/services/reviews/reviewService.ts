import 'server-only';
import type { ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  Review,
  StudentVenture,
  StudentVentureActivity,
  User,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '@/lib/errors';
import { canReview } from '@/lib/permissions/reviewAccess';
import { resolveActivityStatus } from '@/lib/rules/dualReview';
import { refreshCurrentActivity } from '@/services/ventures/studentVentureService';
import type { Role } from '@/lib/constants/roles';
import type { ReviewerType } from '@/lib/constants/status';
import type {
  CreateReviewInput,
  ReviewOnBehalfInput,
  UpdateReviewInput,
} from '@/validators/submissions';
import { logger } from '@/lib/logger';

/**
 * Everything a verdict is filed against, loaded once.
 *
 * The same four records are needed by both paths into a review — a reviewer
 * filing their own, and an administrator filing one on their behalf — so they
 * are fetched in one place rather than twice with a chance of drifting.
 */
async function loadReviewContext(submissionId: string) {
  const submission = await VentureSubmission.findById(submissionId).lean().exec();
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

  return { submission, record, venture, activity };
}

type ReviewContext = Awaited<ReturnType<typeof loadReviewContext>>;

/** The two rules that hold however a verdict arrives. */
async function assertReviewable(context: ReviewContext, reviewerType: ReviewerType) {
  // Only the newest attempt is reviewable — an old attempt's verdict is history.
  if (context.submission.attemptNumber !== context.record.attemptNumber) {
    throw new RuleViolationError(
      'This attempt has been superseded by a newer submission and can no longer be reviewed.',
    );
  }

  const already = await Review.findOne({ submissionId: context.submission._id, reviewerType })
    .select('_id')
    .lean()
    .exec();
  if (already) {
    throw new ConflictError(
      'A ' + reviewerType.toLowerCase() + ' review already exists for this attempt.',
    );
  }
}

/**
 * Writes the verdict and recomputes the activity, in one transaction.
 *
 * `reviewerId` is who the verdict belongs to and who the student sees.
 * `recordedById` is set only when somebody else typed it, and changes nothing
 * about the verdict itself — it is there so that "the mentor approved this"
 * can still be traced to whoever entered it.
 */
async function commitReview(params: {
  context: ReviewContext;
  reviewerType: ReviewerType;
  reviewerId: string;
  status: CreateReviewInput['status'];
  comments?: string;
  recordedById?: string | null;
}) {
  const { context, reviewerType, reviewerId } = params;
  const { record, activity } = context;

  return withTransaction(async (session) => {
    const [review] = await Review.create(
      [
        {
          submissionId: context.submission._id,
          reviewerId,
          reviewerType,
          status: params.status,
          comments: params.comments || undefined,
          recordedById: params.recordedById ?? null,
          reviewedAt: new Date(),
        },
      ],
      { session: session ?? undefined },
    );

    const facultyReviewStatus =
      reviewerType === 'FACULTY' ? params.status : record.facultyReviewStatus;
    const mentorReviewStatus =
      reviewerType === 'MENTOR' ? params.status : record.mentorReviewStatus;

    // Dual review: COMPLETED requires BOTH approvals. One approval alone
    // leaves the activity UNDER_REVIEW and advances nothing.
    const nextStatus = resolveActivityStatus({
      facultyReviewStatus,
      mentorReviewStatus,
      attemptsUsed: record.attemptNumber,
      maxAttempts: activity.maxAttempts,
    });

    const reviewerSnapshot =
      reviewerType === 'FACULTY' ? { reviewFacultyId: reviewerId } : { reviewMentorId: reviewerId };

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
      decision: params.status,
      activityStatus: nextStatus,
      onBehalf: Boolean(params.recordedById),
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

  const context = await loadReviewContext(input.submissionId);

  const permission = canReview(
    reviewer.role,
    { facultyId: context.venture.facultyId, mentorId: context.venture.mentorId },
    reviewer.userId,
  );
  if (!permission.allowed || !permission.reviewerType) {
    throw new ForbiddenError(permission.reason ?? 'You cannot review this submission');
  }
  const reviewerType: ReviewerType = permission.reviewerType;

  await assertReviewable(context, reviewerType);

  return commitReview({
    context,
    reviewerType,
    reviewerId: reviewer.userId,
    status: input.status,
    comments: input.comments,
  });
}

/**
 * The same verdict, entered by an administrator for the assigned reviewer.
 *
 * The programme office fields verdicts given by email, in a meeting or on
 * paper, and a decision that cannot be entered is a student left waiting on
 * one that has already been made. So this exists — but it takes the same path
 * as every other review: the same superseded and duplicate rules, the same
 * dual-review recomputation, and no way to advance an activity that two
 * approvals would not have advanced anyway.
 *
 * Who it is attributed to is read from the venture here, never sent by the
 * form, so an administrator cannot put words in the mouth of a faculty member
 * who has nothing to do with this student.
 */
export async function createReviewOnBehalf(input: ReviewOnBehalfInput, adminUserId: string) {
  await connectToDatabase();

  const context = await loadReviewContext(input.submissionId);

  const reviewerId =
    input.reviewerType === 'FACULTY' ? context.venture.facultyId : context.venture.mentorId;

  if (!reviewerId) {
    throw new RuleViolationError(
      input.reviewerType === 'FACULTY'
        ? 'No faculty member is assigned to this venture, so there is nobody to file this review for.'
        : 'No mentor is assigned to this venture, so there is nobody to file this review for.',
    );
  }

  await assertReviewable(context, input.reviewerType);

  return commitReview({
    context,
    reviewerType: input.reviewerType,
    reviewerId: reviewerId.toString(),
    status: input.status,
    comments: input.comments,
    recordedById: adminUserId,
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

/**
 * The two people currently assigned to review a venture.
 *
 * Only an administrator needs this: a reviewer is one of the two and never
 * files for the other. Returned as names rather than populated documents
 * because `sameId` compares ids by `toString()`, and a populated document
 * would quietly stringify to "[object Object]" everywhere else it is passed.
 */
export async function getAssignedReviewers(studentVentureId: string): Promise<{
  facultyName: string | null;
  mentorName: string | null;
}> {
  await connectToDatabase();

  const venture = await StudentVenture.findById(studentVentureId)
    .select('facultyId mentorId')
    .lean()
    .exec();

  if (!venture) return { facultyName: null, mentorName: null };

  const [faculty, mentor] = await Promise.all([
    venture.facultyId ? User.findById(venture.facultyId).select('name').lean().exec() : null,
    venture.mentorId ? User.findById(venture.mentorId).select('name').lean().exec() : null,
  ]);

  return { facultyName: faculty?.name ?? null, mentorName: mentor?.name ?? null };
}

/** One reviewer's verdict as the student reads it, with the work it was about. */
export interface StudentReviewFeedback {
  _id: string;
  activityCode: string;
  activityName: string;
  attemptNumber: number;
  reviewerType: ReviewerType;
  reviewerName: string;
  status: string;
  comments: string;
  reviewedAt: string;
}

/**
 * Every verdict a student has received, newest first.
 *
 * The verdicts already sit on each activity's own page, but only for whoever
 * thinks to open it. A student who has been asked for a revision needs to find
 * that out without touring twelve activities, which is what this feeds.
 *
 * Verdicts with nothing written on them are left out: a badge the student can
 * already see on the timeline is not feedback.
 */
export async function getReviewFeedbackForStudent(
  studentVentureId: string,
): Promise<StudentReviewFeedback[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ studentVentureId })
    .select('_id ventureActivityId')
    .lean()
    .exec();
  if (records.length === 0) return [];

  const [submissions, activities] = await Promise.all([
    VentureSubmission.find({ studentVentureActivityId: { $in: records.map((r) => r._id) } })
      .select('_id studentVentureActivityId attemptNumber')
      .lean()
      .exec(),
    VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
      .select('activityCode name')
      .lean()
      .exec(),
  ]);
  if (submissions.length === 0) return [];

  const reviews = await Review.find({ submissionId: { $in: submissions.map((s) => s._id) } })
    .populate<{ reviewerId: { _id: unknown; name: string } | null }>('reviewerId', 'name')
    .sort({ reviewedAt: -1 })
    .lean()
    .exec();

  const activityByRecord = new Map(
    records.map((record) => [record._id.toString(), record.ventureActivityId.toString()]),
  );
  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
  const submissionById = new Map(submissions.map((s) => [s._id.toString(), s]));

  return reviews
    .filter((review) => Boolean(review.comments?.trim()))
    .map((review) => {
      const submission = submissionById.get(review.submissionId.toString());
      const activity = submission
        ? activityById.get(
            activityByRecord.get(submission.studentVentureActivityId.toString()) ?? '',
          )
        : undefined;

      return {
        _id: review._id.toString(),
        activityCode: activity?.activityCode ?? '—',
        activityName: activity?.name ?? '',
        attemptNumber: submission?.attemptNumber ?? 0,
        reviewerType: review.reviewerType,
        // The student is shown the reviewer, never the administrator who may
        // have entered the verdict for them.
        reviewerName: review.reviewerId?.name ?? 'Your reviewer',
        status: review.status,
        comments: review.comments ?? '',
        reviewedAt: review.reviewedAt.toISOString(),
      };
    });
}

/**
 * Rebuilds an activity record from whatever verdicts now exist on its current
 * attempt. Exported so a record can be repaired directly if one is ever found
 * out of step with its reviews.
 *
 * Every administrator correction goes through here rather than nudging the two
 * status fields directly. An edited or deleted verdict has to be able to take
 * an activity *backwards* — a COMPLETED activity whose approval was removed is
 * under review again — and a routine that only ever moved forward would leave
 * students holding a completion nobody granted them.
 */
export async function recomputeActivityFromReviews(
  recordId: string,
  session: ClientSession | null = null,
) {
  // Every read joins the transaction. A read outside it sees the snapshot from
  // before the write that prompted the recompute — which silently recomputed
  // the record from the verdict that had just been changed or deleted, and
  // wrote back the state that was being corrected.
  const record = await StudentVentureActivity.findById(recordId).session(session).lean().exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const activity = await VentureActivity.findById(record.ventureActivityId)
    .session(session)
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  // Only the current attempt decides the record. An old attempt's verdict is
  // history and corrections to it change nothing about where the student is.
  const reviews = record.currentSubmissionId
    ? await Review.find({ submissionId: record.currentSubmissionId })
        .session(session)
        .lean()
        .exec()
    : [];

  const facultyReview = reviews.find((review) => review.reviewerType === 'FACULTY');
  const mentorReview = reviews.find((review) => review.reviewerType === 'MENTOR');

  const facultyReviewStatus = facultyReview?.status ?? 'PENDING';
  const mentorReviewStatus = mentorReview?.status ?? 'PENDING';

  const nextStatus = resolveActivityStatus({
    facultyReviewStatus,
    mentorReviewStatus,
    attemptsUsed: record.attemptNumber,
    maxAttempts: activity.maxAttempts,
  });

  await StudentVentureActivity.updateOne(
    { _id: record._id },
    {
      $set: {
        facultyReviewStatus,
        mentorReviewStatus,
        status: nextStatus,
        completedAt: nextStatus === 'COMPLETED' ? (record.completedAt ?? new Date()) : null,
        reviewFacultyId: facultyReview?.reviewerId ?? null,
        reviewMentorId: mentorReview?.reviewerId ?? null,
      },
    },
    sessionOption(session),
  ).exec();

  await refreshCurrentActivity(record.studentVentureId.toString(), session);

  return { facultyReviewStatus, mentorReviewStatus, activityStatus: nextStatus };
}

/**
 * Corrects a verdict already on record — administrators only.
 *
 * The reviewer it belongs to does not change: an edit fixes what was decided,
 * not who decided it. The activity is recomputed afterwards, so changing an
 * approval to a revision request takes the student back out of a completion
 * they should not have had.
 */
export async function updateReview(input: UpdateReviewInput, adminUserId: string) {
  await connectToDatabase();

  const review = await Review.findById(input.reviewId).lean().exec();
  if (!review) throw new NotFoundError('Review not found');

  const submission = await VentureSubmission.findById(review.submissionId)
    .select('studentVentureActivityId')
    .lean()
    .exec();
  if (!submission) throw new NotFoundError('Submission not found');

  return withTransaction(async (session) => {
    await Review.updateOne(
      { _id: review._id },
      {
        $set: {
          status: input.status,
          comments: input.comments || undefined,
          editedById: adminUserId,
          editedAt: new Date(),
        },
        ...(input.comments ? {} : { $unset: { comments: '' } }),
      },
      sessionOption(session),
    ).exec();

    const outcome = await recomputeActivityFromReviews(submission.studentVentureActivityId.toString(), session);

    logger.info('Review corrected', {
      reviewId: review._id.toString(),
      reviewerType: review.reviewerType,
      from: review.status,
      to: input.status,
      by: adminUserId,
      activityStatus: outcome.activityStatus,
    });

    return { reviewId: review._id.toString(), reviewerType: review.reviewerType, ...outcome };
  });
}

/**
 * Removes a verdict — administrators only.
 *
 * The half it occupied goes back to PENDING and the activity is recomputed, so
 * deleting an approval on a completed activity really does put it back under
 * review. That is the point: a verdict entered in error should stop counting.
 */
export async function deleteReview(reviewId: string, adminUserId: string) {
  await connectToDatabase();

  const review = await Review.findById(reviewId).lean().exec();
  if (!review) throw new NotFoundError('Review not found');

  const submission = await VentureSubmission.findById(review.submissionId)
    .select('studentVentureActivityId')
    .lean()
    .exec();
  if (!submission) throw new NotFoundError('Submission not found');

  return withTransaction(async (session) => {
    await Review.deleteOne({ _id: review._id }, sessionOption(session)).exec();

    const outcome = await recomputeActivityFromReviews(submission.studentVentureActivityId.toString(), session);

    logger.info('Review deleted', {
      reviewId,
      reviewerType: review.reviewerType,
      was: review.status,
      by: adminUserId,
      activityStatus: outcome.activityStatus,
    });

    return { deleted: true as const, reviewerType: review.reviewerType, ...outcome };
  });
}
