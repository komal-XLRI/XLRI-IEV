import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import { StudentVenture, StudentVentureActivity, VentureActivity } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  statusOnPresentationCleared,
  statusOnPresentationReceived,
  type PresentationTally,
} from '@/lib/rules/presentations';
import type { StudentActivityStatus } from '@/lib/constants/status';
import { logger } from '@/lib/logger';

/** Sets or clears the Drive folder a venture activity's presentations go into. */
export async function setPresentationFolder(ventureActivityId: string, url: string | null) {
  await connectToDatabase();

  const activity = await VentureActivity.findByIdAndUpdate(
    ventureActivityId,
    { $set: { presentationFolderUrl: url } },
    { returnDocument: 'after' },
  )
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  logger.info('Presentation folder set', { ventureActivityId, cleared: url === null });
  return activity;
}

/**
 * Replaces the set of received presentations for one venture activity.
 *
 * Every listed record is marked received; every unlisted one is cleared —
 * except a COMPLETED record, whose presentation has already had its feedback
 * and cannot be un-received from a checklist.
 */
export async function setPresentationsReceived(
  ventureActivityId: string,
  receivedRecordIds: string[],
  actorUserId: string,
) {
  await connectToDatabase();

  const activity = await VentureActivity.findById(ventureActivityId).select('_id').lean().exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const records = await StudentVentureActivity.find({ ventureActivityId })
    .select('_id status presentationReceivedAt')
    .lean()
    .exec();

  const known = new Set(records.map((record) => record._id.toString()));
  const wanted = new Set(receivedRecordIds);
  for (const id of wanted) {
    if (!known.has(id)) {
      throw new ValidationError('One of the students is not on this venture activity');
    }
  }

  const toMark = records.filter((r) => wanted.has(r._id.toString()) && !r.presentationReceivedAt);
  const toClear = records.filter(
    (r) => !wanted.has(r._id.toString()) && r.presentationReceivedAt && r.status !== 'COMPLETED',
  );

  if (toMark.length === 0 && toClear.length === 0) return { marked: 0, cleared: 0 };

  const now = new Date();
  const actor = new Types.ObjectId(actorUserId);

  // Grouped by the status each record moves to, so the whole change is a
  // handful of updateMany calls rather than one write per student.
  const groups = new Map<
    string,
    { status: StudentActivityStatus; received: boolean; ids: Types.ObjectId[] }
  >();
  const add = (status: StudentActivityStatus, received: boolean, id: Types.ObjectId) => {
    const key = `${status}:${received}`;
    const group = groups.get(key) ?? { status, received, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  };
  for (const r of toMark) add(statusOnPresentationReceived(r.status), true, r._id);
  for (const r of toClear) add(statusOnPresentationCleared(r.status), false, r._id);

  await withTransaction(async (session) => {
    for (const { status, received, ids } of groups.values()) {
      await StudentVentureActivity.updateMany(
        { _id: { $in: ids } },
        {
          $set: received
            ? { status, presentationReceivedAt: now, presentationMarkedBy: actor }
            : { status, presentationReceivedAt: null, presentationMarkedBy: null },
        },
        sessionOption(session),
      ).exec();
    }
  });

  logger.info('Presentations updated', {
    ventureActivityId,
    marked: toMark.length,
    cleared: toClear.length,
  });

  return { marked: toMark.length, cleared: toClear.length };
}

/** One student's line on a venture activity's presentation checklist. */
export interface PresentationRow {
  recordId: string;
  studentVentureId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  status: StudentActivityStatus;
  receivedAt: string | null;
}

/** Everyone enrolled on one venture activity, received or not, by name. */
export async function listPresentationsForActivity(
  ventureActivityId: string,
): Promise<PresentationRow[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ ventureActivityId })
    .select('studentVentureId status presentationReceivedAt')
    .lean()
    .exec();
  if (records.length === 0) return [];

  const ventures = await StudentVenture.find({
    _id: { $in: records.map((r) => r.studentVentureId) },
  })
    .select('ventureName studentId')
    .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
      'studentId',
      'name email',
    )
    .lean()
    .exec();

  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));

  return records
    .map((record) => {
      const venture = ventureById.get(record.studentVentureId.toString());
      return {
        recordId: record._id.toString(),
        studentVentureId: record.studentVentureId.toString(),
        studentName: venture?.studentId?.name ?? 'Unknown student',
        studentEmail: venture?.studentId?.email ?? '',
        ventureName: venture?.ventureName ?? '—',
        status: record.status,
        receivedAt: record.presentationReceivedAt
          ? record.presentationReceivedAt.toISOString()
          : null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/** Received / completed counts for every venture activity, keyed by activity id. */
export async function getPresentationTallies(): Promise<Record<string, PresentationTally>> {
  await connectToDatabase();

  const rows = await StudentVentureActivity.aggregate<{
    _id: Types.ObjectId;
    total: number;
    received: number;
    completed: number;
  }>([
    {
      $group: {
        _id: '$ventureActivityId',
        total: { $sum: 1 },
        // A completed record counts as presented even without a received date
        // — stages completed under the old review flow never had one.
        received: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $ne: [{ $ifNull: ['$presentationReceivedAt', null] }, null] },
                  { $eq: ['$status', 'COMPLETED'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      },
    },
  ]).exec();

  return Object.fromEntries(
    rows.map((row) => [
      row._id.toString(),
      { total: row.total, received: row.received, completed: row.completed },
    ]),
  );
}
