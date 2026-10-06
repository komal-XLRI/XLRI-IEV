import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { BehaviourFeedback, StudentVenture, StudentVentureActivity } from '@/models';
import { NotFoundError } from '@/lib/errors';
import { averageBehaviourRating, type BehaviourRatings } from '@/lib/constants/behaviour';
import type { BehaviourFeedbackInput } from '@/validators/ventures';
import { logger } from '@/lib/logger';
import * as notify from '@/services/notifications/events';

/** Client-safe HR & behaviour feedback. */
export interface BehaviourFeedbackView {
  ratings: BehaviourRatings;
  average: number;
  comments: string | null;
  givenAt: string;
  updatedAt: string;
  /** True once an administrator has changed the feedback after first giving it. */
  edited: boolean;
}

function toView(doc: {
  ratings: BehaviourRatings;
  comments?: string | null;
  givenAt: Date;
  updatedAt: Date;
  updatedBy?: unknown;
}): BehaviourFeedbackView {
  return {
    ratings: doc.ratings,
    average: averageBehaviourRating(doc.ratings),
    comments: doc.comments || null,
    givenAt: doc.givenAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    edited: Boolean(doc.updatedBy),
  };
}

/**
 * Records — or replaces — the administrator's HR & behaviour feedback for one
 * student on one venture activity. Independent of presentations and of stage
 * completion: it changes nothing on the activity record itself.
 */
export async function saveBehaviourFeedback(input: BehaviourFeedbackInput, adminUserId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(input.studentVentureActivityId)
    .select('studentVentureId ventureActivityId')
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const admin = new Types.ObjectId(adminUserId);
  const existing = await BehaviourFeedback.findOne({ studentVentureActivityId: record._id })
    .select('_id')
    .lean()
    .exec();

  const saved = await BehaviourFeedback.findOneAndUpdate(
    { studentVentureActivityId: record._id },
    {
      $set: {
        studentVentureId: record.studentVentureId,
        ventureActivityId: record.ventureActivityId,
        ratings: input.ratings,
        comments: input.comments || undefined,
        ...(existing ? { updatedBy: admin } : {}),
      },
      $setOnInsert: { givenBy: admin, givenAt: new Date() },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  )
    .lean()
    .exec();

  logger.info(existing ? 'Behaviour feedback updated' : 'Behaviour feedback given', {
    studentVentureActivityId: input.studentVentureActivityId,
  });
  await notify.behaviourFeedbackGiven(input.studentVentureActivityId, Boolean(existing));

  return toView(saved!);
}

export async function deleteBehaviourFeedback(studentVentureActivityId: string) {
  await connectToDatabase();
  const result = await BehaviourFeedback.deleteOne({ studentVentureActivityId }).exec();
  if (result.deletedCount === 0) throw new NotFoundError('No feedback to remove');
  logger.info('Behaviour feedback removed', { studentVentureActivityId });
}

/** One student's line on a stage's HR & behaviour list. */
export interface BehaviourRow {
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  feedback: BehaviourFeedbackView | null;
}

/** Everyone on one venture activity, with their feedback if it has been given. */
export async function listBehaviourForActivity(ventureActivityId: string): Promise<BehaviourRow[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ ventureActivityId })
    .select('studentVentureId')
    .lean()
    .exec();
  if (records.length === 0) return [];

  const [ventures, feedback] = await Promise.all([
    StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
      .select('ventureName studentId')
      .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
        'studentId',
        'name email',
      )
      .lean()
      .exec(),
    BehaviourFeedback.find({ ventureActivityId }).lean().exec(),
  ]);

  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
  const feedbackByRecord = new Map(feedback.map((f) => [f.studentVentureActivityId.toString(), f]));

  return records
    .map((record) => {
      const venture = ventureById.get(record.studentVentureId.toString());
      const given = feedbackByRecord.get(record._id.toString());
      return {
        recordId: record._id.toString(),
        studentName: venture?.studentId?.name ?? 'Unknown student',
        studentEmail: venture?.studentId?.email ?? '',
        ventureName: venture?.ventureName ?? '—',
        feedback: given ? toView(given) : null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/** The feedback on one activity record, for the student's own activity page. */
export async function getBehaviourFeedbackForRecord(
  studentVentureActivityId: string,
): Promise<BehaviourFeedbackView | null> {
  await connectToDatabase();
  const doc = await BehaviourFeedback.findOne({ studentVentureActivityId }).lean().exec();
  return doc ? toView(doc) : null;
}

/** How many students on each venture activity have feedback, keyed by activity id. */
export async function getBehaviourTallies(): Promise<Record<string, number>> {
  await connectToDatabase();
  const rows = await BehaviourFeedback.aggregate<{ _id: Types.ObjectId; given: number }>([
    { $group: { _id: '$ventureActivityId', given: { $sum: 1 } } },
  ]).exec();
  return Object.fromEntries(rows.map((row) => [row._id.toString(), row.given]));
}
