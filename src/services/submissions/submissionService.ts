import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  Evidence,
  Review,
  StudentVenture,
  StudentVentureActivity,
  VentureActivity,
  VentureSubmission,
} from '@/models';
import { NotFoundError } from '@/lib/errors';

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
