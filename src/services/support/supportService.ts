import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentSupportActivity, StudentVenture, SupportActivity } from '@/models';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { SupportActivityStatus } from '@/lib/constants/status';

/**
 * Support activity records are deliberately lightweight — several of the eight
 * are participation records (a field visit attended) rather than graded
 * submissions, so there is no attempt limit or dual-review gate here.
 */
export async function getStudentSupportActivities(studentVentureId: string) {
  await connectToDatabase();

  const records = await StudentSupportActivity.find({ studentVentureId }).lean().exec();
  const supports = await SupportActivity.find({
    _id: { $in: records.map((r) => r.supportActivityId) },
  })
    .lean()
    .exec();

  const byId = new Map(supports.map((s) => [s._id.toString(), s]));

  return records
    .map((record) => {
      const support = byId.get(record.supportActivityId.toString());
      return support ? { record, support } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.support.order - b.support.order);
}

export async function updateStudentSupportActivity(
  recordId: string,
  input: { status: SupportActivityStatus; notes?: string },
  actor: { userId: string; role: string },
) {
  await connectToDatabase();

  const record = await StudentSupportActivity.findById(recordId).lean().exec();
  if (!record) throw new NotFoundError('Support activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  const isOwner = venture.studentId.toString() === actor.userId;
  const isAssignedFaculty = venture.facultyId?.toString() === actor.userId;
  const isAssignedMentor = venture.mentorId?.toString() === actor.userId;
  const isAdmin = actor.role === 'ADMIN';

  if (!isOwner && !isAssignedFaculty && !isAssignedMentor && !isAdmin) {
    throw new ForbiddenError('You cannot update this support activity');
  }

  // Students log participation and progress; only reviewers/admin close it out.
  if (isOwner && !isAdmin && (input.status === 'COMPLETED' || input.status === 'REJECTED')) {
    throw new ForbiddenError('Only a reviewer or admin can mark a support activity completed');
  }

  const updated = await StudentSupportActivity.findByIdAndUpdate(
    recordId,
    {
      $set: {
        status: input.status,
        notes: input.notes || undefined,
        submittedAt: record.submittedAt ?? new Date(),
        attemptNumber: record.attemptNumber + (isOwner ? 1 : 0),
      },
    },
    { returnDocument: 'after', runValidators: true },
  )
    .lean()
    .exec();

  return updated!;
}

export async function getSupportActivityParticipation(supportActivityId: string) {
  await connectToDatabase();

  const records = await StudentSupportActivity.find({ supportActivityId }).lean().exec();

  const ventures = await StudentVenture.find({
    _id: { $in: records.map((r) => r.studentVentureId) },
  })
    .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
      'studentId',
      'name email',
    )
    .lean()
    .exec();

  const byId = new Map(ventures.map((v) => [v._id.toString(), v]));

  return records
    .map((record) => {
      const venture = byId.get(record.studentVentureId.toString());
      return venture ? { record, venture } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
