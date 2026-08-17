import 'server-only';
import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  ActivitySupportMapping,
  StudentVentureActivity,
  SupportActivity,
  Term,
  VentureActivity,
} from '@/models';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { durationInDays } from '@/lib/utils/dates';
import type { CreateVentureActivityInput, UpdateVentureActivityInput } from '@/validators/ventures';

export async function listVentureActivities() {
  await connectToDatabase();
  return VentureActivity.find()
    .populate<{ termId: { _id: unknown; termNumber: number; name: string } }>(
      'termId',
      'termNumber name',
    )
    .sort({ order: 1 })
    .lean()
    .exec();
}

export async function listActiveVentureActivities() {
  await connectToDatabase();
  return VentureActivity.find({ status: 'ACTIVE' }).sort({ order: 1 }).lean().exec();
}

export async function getVentureActivity(activityId: string) {
  await connectToDatabase();
  const activity = await VentureActivity.findById(activityId)
    .populate<{ termId: { _id: Types.ObjectId; termNumber: number; name: string } }>(
      'termId',
      'termNumber name',
    )
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');
  return activity;
}

export async function createVentureActivity(input: CreateVentureActivityInput) {
  await connectToDatabase();

  const [codeClash, orderClash, term] = await Promise.all([
    VentureActivity.findOne({ activityCode: input.activityCode }).select('_id').lean().exec(),
    VentureActivity.findOne({ order: input.order }).select('_id').lean().exec(),
    Term.findById(input.termId).select('_id').lean().exec(),
  ]);

  if (codeClash) throw new ConflictError(`Activity code ${input.activityCode} already exists`);
  if (orderClash) throw new ConflictError(`Another activity already uses order ${input.order}`);
  if (!term) throw new NotFoundError('Term not found');

  // durationDays is derived in the schema hook — never taken from the client.
  const created = await VentureActivity.create({
    activityCode: input.activityCode,
    name: input.name,
    description: input.description || undefined,
    termId: input.termId,
    order: input.order,
    startDate: input.startDate,
    endDate: input.endDate,
    maxAttempts: input.maxAttempts,
    evidenceRequired: input.evidenceRequired,
    status: input.status,
  });

  return created.toObject();
}

export async function updateVentureActivity(activityId: string, input: UpdateVentureActivityInput) {
  await connectToDatabase();

  const activity = await VentureActivity.findById(activityId).exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  if (input.order !== undefined && input.order !== activity.order) {
    const clash = await VentureActivity.findOne({ order: input.order, _id: { $ne: activityId } })
      .select('_id')
      .lean()
      .exec();
    if (clash) throw new ConflictError(`Another activity already uses order ${input.order}`);
  }

  if (input.termId) {
    const term = await Term.findById(input.termId).select('_id').lean().exec();
    if (!term) throw new NotFoundError('Term not found');
    activity.termId = term._id;
  }

  if (input.name !== undefined) activity.name = input.name;
  if (input.description !== undefined) activity.description = input.description || undefined;
  if (input.order !== undefined) activity.order = input.order;
  if (input.startDate !== undefined) activity.startDate = input.startDate;
  if (input.endDate !== undefined) activity.endDate = input.endDate;
  if (input.maxAttempts !== undefined) activity.maxAttempts = input.maxAttempts;
  if (input.evidenceRequired !== undefined) activity.evidenceRequired = input.evidenceRequired;
  if (input.status !== undefined) activity.status = input.status;

  // Re-derived by the pre-validate hook too; kept here so `.toObject()` is fresh.
  activity.durationDays = durationInDays(activity.startDate, activity.endDate);

  await activity.save();
  return activity.toObject();
}

export async function deleteVentureActivity(activityId: string) {
  await connectToDatabase();

  const inUse = await StudentVentureActivity.countDocuments({
    ventureActivityId: activityId,
  }).exec();

  if (inUse > 0) {
    throw new ConflictError(
      'Students already have progress records for this activity. Set it to Inactive instead of deleting it.',
    );
  }

  await ActivitySupportMapping.deleteMany({ ventureActivityId: activityId }).exec();
  const result = await VentureActivity.deleteOne({ _id: activityId }).exec();
  if (result.deletedCount === 0) throw new NotFoundError('Venture activity not found');
}

// ------------------------------------------------- Support activities ----

export async function listSupportActivities() {
  await connectToDatabase();
  return SupportActivity.find().sort({ order: 1 }).lean().exec();
}

export async function getSupportActivity(supportActivityId: string) {
  await connectToDatabase();
  const activity = await SupportActivity.findById(supportActivityId).lean().exec();
  if (!activity) throw new NotFoundError('Support activity not found');
  return activity;
}

export async function upsertSupportActivity(input: {
  activityCode: string;
  name: string;
  description?: string;
  order: number;
  scheduleType: string;
  scheduledDate?: Date;
  startTime?: string;
  endTime?: string;
}) {
  await connectToDatabase();

  const orderClash = await SupportActivity.findOne({
    order: input.order,
    activityCode: { $ne: input.activityCode },
  })
    .select('_id')
    .lean()
    .exec();
  if (orderClash)
    throw new ConflictError(`Another support activity already uses order ${input.order}`);

  // Written as an explicit null rather than left out: an omitted key leaves the
  // stored value untouched, so clearing a date on the form would silently keep
  // the old one. The model treats null as "no schedule".
  const updated = await SupportActivity.findOneAndUpdate(
    { activityCode: input.activityCode },
    {
      $set: {
        name: input.name,
        description: input.description || undefined,
        order: input.order,
        scheduleType: input.scheduleType,
        scheduledDate: input.scheduledDate ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      },
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  return updated!.toObject();
}

// -------------------------------------------------- Support mappings ----

/** V → the Support Activities that feed it. */
export async function getSupportActivitiesForVentureActivity(ventureActivityId: string) {
  await connectToDatabase();

  const mappings = await ActivitySupportMapping.find({ ventureActivityId })
    .select('supportActivityId')
    .lean()
    .exec();

  const ids = mappings.map((m) => m.supportActivityId);
  return SupportActivity.find({ _id: { $in: ids } })
    .sort({ order: 1 })
    .lean()
    .exec();
}

/** A → the Venture Activities it supports. The mapping reads both ways. */
export async function getVentureActivitiesForSupportActivity(supportActivityId: string) {
  await connectToDatabase();

  const mappings = await ActivitySupportMapping.find({ supportActivityId })
    .select('ventureActivityId')
    .lean()
    .exec();

  const ids = mappings.map((m) => m.ventureActivityId);
  return VentureActivity.find({ _id: { $in: ids } })
    .sort({ order: 1 })
    .lean()
    .exec();
}

/** Whole mapping table, keyed by venture activity id — used by list screens. */
export async function getSupportMappingIndex(): Promise<Record<string, string[]>> {
  await connectToDatabase();

  const mappings = await ActivitySupportMapping.find().lean().exec();
  const index: Record<string, string[]> = {};

  for (const mapping of mappings) {
    const key = mapping.ventureActivityId.toString();
    (index[key] ??= []).push(mapping.supportActivityId.toString());
  }

  return index;
}

export async function setSupportMappings(ventureActivityId: string, supportActivityIds: string[]) {
  await connectToDatabase();

  const activity = await VentureActivity.findById(ventureActivityId).select('_id').lean().exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const supports = await SupportActivity.find({ _id: { $in: supportActivityIds } })
    .select('_id')
    .lean()
    .exec();

  if (supports.length !== new Set(supportActivityIds).size) {
    throw new NotFoundError('One or more support activities were not found');
  }

  await ActivitySupportMapping.deleteMany({
    ventureActivityId,
    supportActivityId: { $nin: supportActivityIds },
  }).exec();

  for (const supportActivityId of supportActivityIds) {
    await ActivitySupportMapping.updateOne(
      { ventureActivityId, supportActivityId },
      { $setOnInsert: { ventureActivityId, supportActivityId } },
      { upsert: true },
    ).exec();
  }

  return getSupportActivitiesForVentureActivity(ventureActivityId);
}
