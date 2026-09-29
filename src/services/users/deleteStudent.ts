import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  BehaviourFeedback,
  Evidence,
  Review,
  StudentProfile,
  StudentSupportActivity,
  StudentVenture,
  StudentVentureActivity,
  SubjectAttendance,
  User,
  VentureActivityAttendance,
  VentureSubmission,
  WorkshopAttendance,
  WorkshopFeedback,
} from '@/models';
import { NotFoundError, RuleViolationError, ValidationError } from '@/lib/errors';
import { deleteUpload } from '@/lib/cloudinary/signing';
import { logger } from '@/lib/logger';

export interface DeletedStudent {
  userId: string;
  name: string;
  removed: {
    ventures: number;
    activityRecords: number;
    supportRecords: number;
    submissions: number;
    reviews: number;
    evidenceFiles: number;
    attendanceRecords: number;
    workshopFeedback: number;
    behaviourFeedback: number;
  };
  /** Uploaded files Cloudinary refused to delete; their records are gone regardless. */
  filesLeftInStorage: number;
}

/**
 * Permanently removes a student and everything that exists only because of
 * them: their venture, its activity and support records, every submission,
 * review and evidence file on it, and every attendance and workshop-feedback
 * row in their name, and their HR & behaviour feedback.
 *
 * This is the one place a user is deleted rather than deactivated. It is
 * limited to students — faculty and mentors are referenced from other
 * people's records (reviews, assignments, sessions) that must stay readable.
 *
 * `confirmEmail` must match the account: the action cannot be undone, and a
 * typed confirmation is what stops a mis-click on the wrong row from being one.
 */
export async function deleteStudent(userId: string, confirmEmail: string): Promise<DeletedStudent> {
  await connectToDatabase();

  const user = await User.findById(userId).select('name email role').lean().exec();
  if (!user) throw new NotFoundError('Student not found');
  if (user.role !== 'STUDENT') {
    throw new RuleViolationError(
      'Only student accounts can be deleted. Deactivate others instead.',
    );
  }
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ValidationError('The email typed does not match this student’s email.');
  }

  const ventures = await StudentVenture.find({ studentId: userId }).select('_id').lean().exec();
  const ventureIds = ventures.map((v) => v._id);

  const records = await StudentVentureActivity.find({ studentVentureId: { $in: ventureIds } })
    .select('_id')
    .lean()
    .exec();
  const recordIds = records.map((r) => r._id);

  const submissions = await VentureSubmission.find({ studentVentureActivityId: { $in: recordIds } })
    .select('_id')
    .lean()
    .exec();
  const submissionIds = submissions.map((s) => s._id);

  // Read before the transaction so the files can be removed from storage once
  // the database side has committed.
  const files = await Evidence.find({
    $or: [
      { studentVentureActivityId: { $in: recordIds } },
      { submissionId: { $in: submissionIds } },
    ],
  })
    .select('_id publicId resourceType')
    .lean()
    .exec();

  const removed = await withTransaction(async (session) => {
    const opts = sessionOption(session);

    const reviews = await Review.deleteMany({ submissionId: { $in: submissionIds } }, opts).exec();
    const evidence = await Evidence.deleteMany(
      { _id: { $in: files.map((f) => f._id) } },
      opts,
    ).exec();
    const subs = await VentureSubmission.deleteMany({ _id: { $in: submissionIds } }, opts).exec();
    const activity = await StudentVentureActivity.deleteMany(
      { studentVentureId: { $in: ventureIds } },
      opts,
    ).exec();
    const support = await StudentSupportActivity.deleteMany(
      { studentVentureId: { $in: ventureIds } },
      opts,
    ).exec();
    const ventureAttendance = await VentureActivityAttendance.deleteMany(
      { studentVentureId: { $in: ventureIds } },
      opts,
    ).exec();
    const venture = await StudentVenture.deleteMany({ _id: { $in: ventureIds } }, opts).exec();
    const classAttendance = await SubjectAttendance.deleteMany({ studentId: userId }, opts).exec();
    const workshopAttendance = await WorkshopAttendance.deleteMany(
      { studentId: userId },
      opts,
    ).exec();
    const feedback = await WorkshopFeedback.deleteMany({ studentId: userId }, opts).exec();
    const behaviour = await BehaviourFeedback.deleteMany(
      { studentVentureId: { $in: ventureIds } },
      opts,
    ).exec();
    await StudentProfile.deleteMany({ userId }, opts).exec();
    await User.deleteOne({ _id: userId }, opts).exec();

    return {
      ventures: venture.deletedCount,
      activityRecords: activity.deletedCount,
      supportRecords: support.deletedCount,
      submissions: subs.deletedCount,
      reviews: reviews.deletedCount,
      evidenceFiles: evidence.deletedCount,
      attendanceRecords:
        ventureAttendance.deletedCount +
        classAttendance.deletedCount +
        workshopAttendance.deletedCount,
      workshopFeedback: feedback.deletedCount,
      behaviourFeedback: behaviour.deletedCount,
    };
  });

  // Storage is outside the transaction. A file that fails to delete is logged
  // and counted rather than failing the whole deletion, which has committed.
  let filesLeftInStorage = 0;
  for (const file of files) {
    try {
      await deleteUpload(file.publicId, file.resourceType);
    } catch (error) {
      filesLeftInStorage += 1;
      logger.warn('Evidence file not removed from storage', {
        publicId: file.publicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Student deleted', { userId, removed, filesLeftInStorage });

  return { userId, name: user.name, removed, filesLeftInStorage };
}
