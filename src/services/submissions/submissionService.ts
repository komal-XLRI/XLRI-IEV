import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  Evidence,
  Review,
  StudentVenture,
  StudentVentureActivity,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import { ForbiddenError, NotFoundError, RuleViolationError } from '@/lib/errors';
import { evaluateAttempt } from '@/lib/rules/attempts';
import { computeProgression } from '@/lib/rules/progression';
import { attachDraftEvidence, countDraftEvidence } from '@/services/evidence/evidenceService';
import { logger } from '@/lib/logger';
import type { CreateSubmissionInput } from '@/validators/submissions';

/**
 * Creates the next submission attempt.
 *
 * Everything that decides whether this is allowed — the attempt number, the
 * submission type, the progression lock — is computed here from persisted
 * state. Nothing about the attempt is taken from the request body.
 */
export async function createSubmission(input: CreateSubmissionInput, studentUserId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(input.studentVentureActivityId)
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  // Ownership: a student may only submit against their own venture.
  if (venture.studentId.toString() !== studentUserId) {
    throw new ForbiddenError('This activity does not belong to you');
  }

  const activity = await VentureActivity.findById(record.ventureActivityId).lean().exec();
  if (!activity) throw new NotFoundError('Venture activity not found');
  if (activity.status !== 'ACTIVE') {
    throw new RuleViolationError('This activity is not currently active');
  }

  // Progression lock — recomputed across the whole venture, not trusted from the caller.
  const unlocked = await isActivityUnlocked(record.studentVentureId.toString(), activity.order);

  const decision = evaluateAttempt({
    attemptsUsed: record.attemptNumber,
    maxAttempts: activity.maxAttempts,
    status: record.status,
    unlocked,
  });

  if (!decision.canSubmit) {
    throw new RuleViolationError(decision.reason ?? 'Submission is not allowed right now');
  }

  // The evidence rule is enforced here, not in the browser. A student stages
  // files against the record before submitting, so by this point "required
  // evidence is present" is a question the server can actually answer — which
  // is the whole reason uploads are scoped to the record rather than to the
  // attempt that does not exist yet.
  if (activity.evidenceRequired) {
    const staged = await countDraftEvidence(record._id.toString());
    if (staged === 0) {
      throw new RuleViolationError(
        'This activity requires evidence. Attach at least one file before submitting.',
      );
    }
  }

  return withTransaction(async (session) => {
    // Re-read inside the transaction and gate the update on the attempt count
    // we based the decision on, so two concurrent submits cannot both win.
    const claimed = await StudentVentureActivity.findOneAndUpdate(
      { _id: record._id, attemptNumber: record.attemptNumber },
      {
        $set: {
          attemptNumber: decision.nextAttemptNumber,
          status: 'UNDER_REVIEW',
          // A new attempt resets both verdicts — reviewers judge this attempt,
          // not the previous one.
          facultyReviewStatus: 'PENDING',
          mentorReviewStatus: 'PENDING',
          reviewFacultyId: venture.facultyId ?? null,
          reviewMentorId: venture.mentorId ?? null,
          facultyId: venture.facultyId ?? null,
          mentorId: venture.mentorId ?? null,
          startedAt: record.startedAt ?? new Date(),
          completedAt: null,
        },
      },
      { returnDocument: 'after', ...sessionOption(session) },
    ).exec();

    if (!claimed) {
      throw new RuleViolationError('Another submission was recorded just now. Reload and retry.');
    }

    const [submission] = await VentureSubmission.create(
      [
        {
          studentVentureActivityId: record._id,
          submittedBy: studentUserId,
          attemptNumber: decision.nextAttemptNumber,
          submissionType: decision.submissionType,
          title: input.title || undefined,
          content: input.content || undefined,
          remarks: input.remarks || undefined,
          submittedAt: new Date(),
        },
      ],
      { session: session ?? undefined },
    );

    await StudentVentureActivity.updateOne(
      { _id: record._id },
      { $set: { currentSubmissionId: submission!._id } },
      sessionOption(session),
    ).exec();

    // Inside the transaction, so the attempt and its evidence appear together.
    const evidenceAttached = await attachDraftEvidence(
      record._id.toString(),
      submission!._id.toString(),
      session,
    );

    logger.info('Submission created', {
      submissionId: submission!._id.toString(),
      attemptNumber: decision.nextAttemptNumber,
      studentVentureActivityId: record._id.toString(),
      evidenceAttached,
    });

    return {
      submissionId: submission!._id.toString(),
      attemptNumber: decision.nextAttemptNumber,
      submissionType: decision.submissionType,
      evidenceRequired: activity.evidenceRequired,
      evidenceAttached,
    };
  });
}

async function isActivityUnlocked(studentVentureId: string, order: number): Promise<boolean> {
  const records = await StudentVentureActivity.find({ studentVentureId })
    .select('ventureActivityId status')
    .lean()
    .exec();

  const activities = await VentureActivity.find({
    _id: { $in: records.map((r) => r.ventureActivityId) },
  })
    .select('order')
    .lean()
    .exec();

  const orderById = new Map(activities.map((a) => [a._id.toString(), a.order]));

  const entries = records
    .map((r) => {
      const activityOrder = orderById.get(r.ventureActivityId.toString());
      return activityOrder === undefined ? null : { order: activityOrder, status: r.status };
    })
    .filter((e): e is { order: number; status: (typeof records)[number]['status'] } => e !== null);

  return computeProgression(entries).find((p) => p.entry.order === order)?.unlocked ?? false;
}

// ------------------------------------------------------------- Reading ----

export async function getSubmission(submissionId: string) {
  await connectToDatabase();
  const submission = await VentureSubmission.findById(submissionId).lean().exec();
  if (!submission) throw new NotFoundError('Submission not found');
  return submission;
}

/** Full attempt history for an activity, newest first, with reviews and evidence. */
export async function getSubmissionHistory(studentVentureActivityId: string) {
  await connectToDatabase();

  const submissions = await VentureSubmission.find({ studentVentureActivityId })
    .sort({ attemptNumber: -1 })
    .lean()
    .exec();

  if (submissions.length === 0) return [];

  const submissionIds = submissions.map((s) => s._id);

  const [reviews, evidence] = await Promise.all([
    Review.find({ submissionId: { $in: submissionIds } })
      .populate<{ reviewerId: { _id: unknown; name: string } }>('reviewerId', 'name')
      .sort({ reviewedAt: 1 })
      .lean()
      .exec(),
    Evidence.find({ submissionId: { $in: submissionIds } })
      .sort({ uploadedAt: 1 })
      .lean()
      .exec(),
  ]);

  return submissions.map((submission) => {
    const key = submission._id.toString();
    return {
      submission,
      reviews: reviews.filter((r) => r.submissionId.toString() === key),
      evidence: evidence.filter((e) => e.submissionId?.toString() === key),
    };
  });
}

export async function getSubmissionBundle(submissionId: string) {
  await connectToDatabase();

  const submission = await getSubmission(submissionId);

  const [record, reviews, evidence] = await Promise.all([
    StudentVentureActivity.findById(submission.studentVentureActivityId).lean().exec(),
    Review.find({ submissionId })
      .populate<{ reviewerId: { _id: unknown; name: string } }>('reviewerId', 'name')
      .lean()
      .exec(),
    Evidence.find({ submissionId }).lean().exec(),
  ]);

  if (!record) throw new NotFoundError('Activity record not found');

  const [venture, activity] = await Promise.all([
    StudentVenture.findById(record.studentVentureId)
      .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
        'studentId',
        'name email',
      )
      .lean()
      .exec(),
    VentureActivity.findById(record.ventureActivityId).lean().exec(),
  ]);

  if (!venture) throw new NotFoundError('Venture not found');
  if (!activity) throw new NotFoundError('Venture activity not found');

  return { submission, record, venture, activity, reviews, evidence };
}
