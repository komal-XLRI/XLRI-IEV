import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentVenture, StudentVentureActivity, User, VentureActivity } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { StudentActivityStatus } from '@/lib/constants/status';
import { refreshCurrentActivity } from '@/services/ventures/studentVentureService';
import * as notify from '@/services/notifications/events';
import { logger } from '@/lib/logger';

/**
 * Marking a stage complete by hand.
 *
 * A stage normally completes when mentor feedback arrives through the feedback
 * form. Where feedback was collected some other way — on paper, in a
 * spreadsheet — the programme office marks it complete here instead, which
 * unlocks the next stage exactly as feedback would. Only a stage marked by
 * hand can be reopened here; one completed on feedback has its record and
 * stays complete.
 */

export interface StageCompletionRow {
  recordId: string;
  studentName: string;
  ventureName: string;
  status: StudentActivityStatus;
  completedAt: Date | null;
  /** Marked complete by an administrator rather than on feedback. */
  markedByAdmin: boolean;
  completedByName: string | null;
  /** Whether the stage before this one is complete — false means this stage is still locked for them. */
  previousComplete: boolean;
}

export async function listStageCompletion(
  ventureActivityId: string,
): Promise<StageCompletionRow[]> {
  await connectToDatabase();

  const activity = await VentureActivity.findById(ventureActivityId).select('order').lean().exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const previous = await VentureActivity.findOne({ order: { $lt: activity.order } })
    .sort({ order: -1 })
    .select('_id')
    .lean()
    .exec();

  const records = await StudentVentureActivity.find({ ventureActivityId })
    .select('studentVentureId status completedAt completedBy')
    .lean()
    .exec();
  if (records.length === 0) return [];

  const ventureIds = records.map((r) => r.studentVentureId);
  const [ventures, previousDone] = await Promise.all([
    StudentVenture.find({ _id: { $in: ventureIds } })
      .select('ventureName studentId')
      .lean()
      .exec(),
    previous
      ? StudentVentureActivity.find({
          studentVentureId: { $in: ventureIds },
          ventureActivityId: previous._id,
          status: 'COMPLETED',
        })
          .select('studentVentureId')
          .lean()
          .exec()
      : Promise.resolve(null),
  ]);

  const userIds = [
    ...ventures.map((v) => v.studentId),
    ...records.flatMap((r) => (r.completedBy ? [r.completedBy] : [])),
  ];
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id name')
    .lean()
    .exec();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
  const previousDoneIds = previousDone
    ? new Set(previousDone.map((r) => r.studentVentureId.toString()))
    : null;

  return records
    .map((record) => {
      const venture = ventureById.get(record.studentVentureId.toString());
      return {
        recordId: record._id.toString(),
        studentName: (venture && nameById.get(venture.studentId.toString())) ?? 'Unknown student',
        ventureName: venture?.ventureName ?? '—',
        status: record.status,
        completedAt: record.completedAt ?? null,
        markedByAdmin: record.status === 'COMPLETED' && record.completedBy != null,
        completedByName: record.completedBy
          ? (nameById.get(record.completedBy.toString()) ?? null)
          : null,
        previousComplete: previousDoneIds
          ? previousDoneIds.has(record.studentVentureId.toString())
          : true,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

async function stageRecords(ventureActivityId: string, recordIds: string[]) {
  if (recordIds.length === 0) throw new ValidationError('Choose at least one student');
  const records = await StudentVentureActivity.find({
    _id: { $in: recordIds },
    ventureActivityId,
  })
    .select('_id studentVentureId status presentationReceivedAt completedBy')
    .lean()
    .exec();
  if (records.length !== new Set(recordIds).size) {
    throw new ValidationError('One of the students is not on this venture activity');
  }
  return records;
}

/** Marks the chosen students' stage complete. Already-complete ones are left as they are. */
export async function markStageComplete(
  ventureActivityId: string,
  recordIds: string[],
  actorId: string,
): Promise<{ completed: number; alreadyComplete: number }> {
  await connectToDatabase();
  const records = await stageRecords(ventureActivityId, recordIds);
  const open = records.filter((r) => r.status !== 'COMPLETED');

  const now = new Date();
  let completed = 0;
  for (const record of open) {
    const result = await StudentVentureActivity.updateOne(
      { _id: record._id, status: { $ne: 'COMPLETED' } },
      {
        $set: {
          status: 'COMPLETED',
          completedAt: now,
          completedBy: new Types.ObjectId(actorId),
        },
      },
    ).exec();
    if (result.modifiedCount === 0) continue;
    completed += 1;

    await refreshCurrentActivity(record.studentVentureId.toString());
    await notify.stageCompleted(record._id.toString(), true);
  }

  logger.info('Stage marked complete by admin', {
    ventureActivityId,
    completed,
    userId: actorId,
  });
  return { completed, alreadyComplete: records.length - completed };
}

/**
 * Takes back a hand-marked completion. The stage goes back to "presentation
 * received" when the student has presented, or "not started" when not, and
 * the stages after it lock again.
 */
export async function reopenStage(
  ventureActivityId: string,
  recordIds: string[],
  actorId: string,
): Promise<{ reopened: number; skipped: number }> {
  await connectToDatabase();
  const records = await stageRecords(ventureActivityId, recordIds);
  const manual = records.filter((r) => r.status === 'COMPLETED' && r.completedBy != null);

  for (const record of manual) {
    await StudentVentureActivity.updateOne(
      { _id: record._id, status: 'COMPLETED', completedBy: { $ne: null } },
      {
        $set: {
          status: record.presentationReceivedAt ? 'PRESENTATION_RECEIVED' : 'NOT_STARTED',
          completedAt: null,
          completedBy: null,
        },
      },
    ).exec();
    await refreshCurrentActivity(record.studentVentureId.toString());
  }

  logger.info('Stage reopened by admin', {
    ventureActivityId,
    reopened: manual.length,
    userId: actorId,
  });
  return { reopened: manual.length, skipped: records.length - manual.length };
}
