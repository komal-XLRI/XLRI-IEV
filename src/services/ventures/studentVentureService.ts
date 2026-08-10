import 'server-only';
import type { ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  StudentSupportActivity,
  StudentVenture,
  StudentVentureActivity,
  SupportActivity,
  VentureActivity,
  type IStudentVenture,
  type IStudentVentureActivity,
  type IVentureActivity,
} from '@/models';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { assertUserHasRole } from '@/services/users/userService';
import { computeProgression, type ProgressionEntry } from '@/lib/rules/progression';
import { evaluateAttempt, type AttemptDecision } from '@/lib/rules/attempts';
import { describeReviewProgress } from '@/lib/rules/dualReview';
import type { UiActivityState } from '@/lib/constants/status';
import type { AssignReviewersInput, CreateStudentVentureInput } from '@/validators/ventures';
import { logger } from '@/lib/logger';

// ------------------------------------------------------------ Ventures ----

export async function getVentureByStudentId(studentId: string) {
  await connectToDatabase();
  return StudentVenture.findOne({ studentId }).lean().exec();
}

export async function getVentureById(studentVentureId: string) {
  await connectToDatabase();
  const venture = await StudentVenture.findById(studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');
  return venture;
}

export async function getVentureDetail(studentVentureId: string) {
  await connectToDatabase();

  const venture = await StudentVenture.findById(studentVentureId)
    .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
      'studentId',
      'name email',
    )
    .populate<{ facultyId: { _id: unknown; name: string; email: string } | null }>(
      'facultyId',
      'name email',
    )
    .populate<{ mentorId: { _id: unknown; name: string; email: string } | null }>(
      'mentorId',
      'name email',
    )
    .lean()
    .exec();

  if (!venture) throw new NotFoundError('Venture not found');
  return venture;
}

export async function listVentures(
  filters: { facultyId?: string; mentorId?: string; q?: string } = {},
) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (filters.facultyId) filter.facultyId = filters.facultyId;
  if (filters.mentorId) filter.mentorId = filters.mentorId;
  if (filters.q) {
    const pattern = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.ventureName = pattern;
  }

  return StudentVenture.find(filter)
    .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
      'studentId',
      'name email',
    )
    .populate<{ facultyId: { _id: unknown; name: string } | null }>('facultyId', 'name')
    .populate<{ mentorId: { _id: unknown; name: string } | null }>('mentorId', 'name')
    .populate<{
      currentVentureActivityId: { _id: unknown; activityCode: string; name: string } | null;
    }>('currentVentureActivityId', 'activityCode name')
    .sort({ createdAt: -1 })
    .lean()
    .exec();
}

/**
 * Creating a venture also materialises one StudentVentureActivity per active
 * Venture Activity, so progress rows exist before the student ever logs in.
 */
export async function createStudentVenture(input: CreateStudentVentureInput) {
  await connectToDatabase();

  await assertUserHasRole(input.studentId, 'STUDENT');

  const existing = await StudentVenture.findOne({ studentId: input.studentId })
    .select('_id')
    .lean()
    .exec();
  if (existing) throw new ConflictError('This student already has a venture');

  if (input.facultyId) await assertUserHasRole(input.facultyId, 'FACULTY');
  if (input.mentorId) await assertUserHasRole(input.mentorId, 'MENTOR');

  return withTransaction(async (session) => {
    const [venture] = await StudentVenture.create(
      [
        {
          studentId: input.studentId,
          ventureName: input.ventureName,
          ventureTitle: input.ventureTitle || undefined,
          industry: input.industry || undefined,
          targetMarket: input.targetMarket || undefined,
          problemStatement: input.problemStatement || undefined,
          solution: input.solution || undefined,
          fundingStatus: input.fundingStatus || undefined,
          facultyId: input.facultyId ?? null,
          mentorId: input.mentorId ?? null,
          status: input.status,
        },
      ],
      { session: session ?? undefined },
    );

    await bootstrapActivityRecords(venture!._id.toString(), session);

    logger.info('Venture created', { ventureId: venture!._id.toString() });
    return { studentVentureId: venture!._id.toString() };
  });
}

export async function updateStudentVenture(
  studentVentureId: string,
  input: Record<string, unknown>,
) {
  await connectToDatabase();

  const updated = await StudentVenture.findByIdAndUpdate(
    studentVentureId,
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  )
    .lean()
    .exec();

  if (!updated) throw new NotFoundError('Venture not found');
  return updated;
}

/**
 * Reviewer assignment — Admin only.
 *
 * Reassignment updates the *current* assignment on the venture and on every
 * activity that has not yet been reviewed. Activities that already carry a
 * `reviewFacultyId` / `reviewMentorId` snapshot keep it, so completed history
 * still names the person who actually reviewed it.
 */
export async function assignReviewers(studentVentureId: string, input: AssignReviewersInput) {
  await connectToDatabase();

  if (input.facultyId) await assertUserHasRole(input.facultyId, 'FACULTY');
  if (input.mentorId) await assertUserHasRole(input.mentorId, 'MENTOR');

  return withTransaction(async (session) => {
    const venture = await StudentVenture.findByIdAndUpdate(
      studentVentureId,
      { $set: { facultyId: input.facultyId ?? null, mentorId: input.mentorId ?? null } },
      { returnDocument: 'after', ...sessionOption(session) },
    ).exec();

    if (!venture) throw new NotFoundError('Venture not found');

    await StudentVentureActivity.updateMany(
      { studentVentureId },
      { $set: { facultyId: input.facultyId ?? null, mentorId: input.mentorId ?? null } },
      sessionOption(session),
    ).exec();

    await StudentSupportActivity.updateMany(
      { studentVentureId },
      { $set: { facultyId: input.facultyId ?? null, mentorId: input.mentorId ?? null } },
      sessionOption(session),
    ).exec();

    logger.info('Reviewers assigned', {
      ventureId: studentVentureId,
      facultyId: input.facultyId ?? null,
      mentorId: input.mentorId ?? null,
    });

    return venture.toObject();
  });
}

// --------------------------------------------------- Activity records ----

/** Creates any missing StudentVentureActivity / StudentSupportActivity rows. */
export async function bootstrapActivityRecords(
  studentVentureId: string,
  session: ClientSession | null = null,
) {
  const venture = await StudentVenture.findById(studentVentureId)
    .select('facultyId mentorId')
    .session(session)
    .lean()
    .exec();
  if (!venture) throw new NotFoundError('Venture not found');

  const [activities, supports, existingActivities, existingSupports] = await Promise.all([
    VentureActivity.find({ status: 'ACTIVE' }).select('_id').session(session).lean().exec(),
    SupportActivity.find().select('_id').session(session).lean().exec(),
    StudentVentureActivity.find({ studentVentureId })
      .select('ventureActivityId')
      .session(session)
      .lean()
      .exec(),
    StudentSupportActivity.find({ studentVentureId })
      .select('supportActivityId')
      .session(session)
      .lean()
      .exec(),
  ]);

  const haveActivity = new Set(existingActivities.map((r) => r.ventureActivityId.toString()));
  const haveSupport = new Set(existingSupports.map((r) => r.supportActivityId.toString()));

  const newActivities = activities
    .filter((a) => !haveActivity.has(a._id.toString()))
    .map((a) => ({
      studentVentureId,
      ventureActivityId: a._id,
      facultyId: venture.facultyId ?? null,
      mentorId: venture.mentorId ?? null,
      attemptNumber: 0,
      status: 'NOT_STARTED' as const,
      facultyReviewStatus: 'PENDING' as const,
      mentorReviewStatus: 'PENDING' as const,
    }));

  const newSupports = supports
    .filter((s) => !haveSupport.has(s._id.toString()))
    .map((s) => ({
      studentVentureId,
      supportActivityId: s._id,
      facultyId: venture.facultyId ?? null,
      mentorId: venture.mentorId ?? null,
      attemptNumber: 0,
      status: 'PENDING' as const,
    }));

  if (newActivities.length > 0) {
    await StudentVentureActivity.insertMany(newActivities, { session: session ?? undefined });
  }
  if (newSupports.length > 0) {
    await StudentSupportActivity.insertMany(newSupports, { session: session ?? undefined });
  }

  await refreshCurrentActivity(studentVentureId, session);

  return { activitiesCreated: newActivities.length, supportsCreated: newSupports.length };
}

/**
 * Points `currentVentureActivityId` at the first unlocked, incomplete activity.
 * Called after every state change so the pointer can never drift.
 */
export async function refreshCurrentActivity(
  studentVentureId: string,
  session: ClientSession | null = null,
) {
  const rows = await loadProgressRows(studentVentureId, session);
  const progression = computeProgression(rows);
  const current = progression.find((p) => p.unlocked && p.entry.status !== 'COMPLETED');

  await StudentVenture.updateOne(
    { _id: studentVentureId },
    { $set: { currentVentureActivityId: current?.entry.ventureActivityId ?? null } },
    sessionOption(session),
  ).exec();

  return current?.entry.ventureActivityId?.toString() ?? null;
}

interface ProgressRow extends ProgressionEntry {
  recordId: string;
  ventureActivityId: string;
  maxAttempts: number;
  attemptsUsed: number;
}

async function loadProgressRows(
  studentVentureId: string,
  session: ClientSession | null = null,
): Promise<ProgressRow[]> {
  const records = await StudentVentureActivity.find({ studentVentureId })
    .session(session)
    .lean()
    .exec();

  const activityIds = records.map((r) => r.ventureActivityId);
  const activities = await VentureActivity.find({ _id: { $in: activityIds } })
    .select('order maxAttempts')
    .session(session)
    .lean()
    .exec();

  const byId = new Map(activities.map((a) => [a._id.toString(), a]));

  return records
    .map((record) => {
      const activity = byId.get(record.ventureActivityId.toString());
      if (!activity) return null;
      return {
        recordId: record._id.toString(),
        ventureActivityId: record.ventureActivityId.toString(),
        order: activity.order,
        status: record.status,
        maxAttempts: activity.maxAttempts,
        attemptsUsed: record.attemptNumber,
      } satisfies ProgressRow;
    })
    .filter((row): row is ProgressRow => row !== null);
}

// ------------------------------------------------------- Progress view ----

export interface VentureActivityProgress {
  recordId: string;
  activity: IVentureActivity;
  record: IStudentVentureActivity;
  uiState: UiActivityState;
  unlocked: boolean;
  attempt: AttemptDecision;
  reviewSummary: string;
}

/**
 * The read model behind the student timeline, the reviewer screens and the
 * reports. `LOCKED` is derived here rather than stored.
 */
export async function getVentureProgress(
  studentVentureId: string,
): Promise<VentureActivityProgress[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ studentVentureId }).lean().exec();
  const activities = await VentureActivity.find({
    _id: { $in: records.map((r) => r.ventureActivityId) },
  })
    .lean()
    .exec();

  const activityById = new Map(activities.map((a) => [a._id.toString(), a]));

  const paired = records
    .map((record) => {
      const activity = activityById.get(record.ventureActivityId.toString());
      return activity ? { record, activity } : null;
    })
    .filter(
      (v): v is { record: (typeof records)[number]; activity: (typeof activities)[number] } =>
        v !== null,
    );

  const progression = computeProgression(
    paired.map((p) => ({
      order: p.activity.order,
      status: p.record.status,
      key: p.record._id.toString(),
    })),
  );

  const unlockedByKey = new Map(progression.map((p) => [p.entry.key, p]));

  return paired
    .sort((a, b) => a.activity.order - b.activity.order)
    .map(({ record, activity }) => {
      const derived = unlockedByKey.get(record._id.toString())!;
      const attempt = evaluateAttempt({
        attemptsUsed: record.attemptNumber,
        maxAttempts: activity.maxAttempts,
        status: record.status,
        unlocked: derived.unlocked,
      });

      return {
        recordId: record._id.toString(),
        activity: activity as IVentureActivity,
        record: record as IStudentVentureActivity,
        uiState: derived.uiState,
        unlocked: derived.unlocked,
        attempt,
        reviewSummary: describeReviewProgress(
          record.facultyReviewStatus,
          record.mentorReviewStatus,
        ),
      };
    });
}

/** Loads one activity record together with everything needed to authorise it. */
export async function getActivityContext(studentVentureActivityId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(studentVentureActivityId).lean().exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const [venture, activity] = await Promise.all([
    StudentVenture.findById(record.studentVentureId).lean().exec(),
    VentureActivity.findById(record.ventureActivityId).lean().exec(),
  ]);

  if (!venture) throw new NotFoundError('Venture not found');
  if (!activity) throw new NotFoundError('Venture activity not found');

  const progress = await getVentureProgress(record.studentVentureId.toString());
  const entry = progress.find((p) => p.recordId === studentVentureActivityId);

  return {
    record: record as IStudentVentureActivity,
    venture: venture as IStudentVenture,
    activity: activity as IVentureActivity,
    unlocked: entry?.unlocked ?? false,
    attempt: entry?.attempt,
  };
}

export function assertStudentOwnsVenture(venture: IStudentVenture, studentUserId: string): void {
  if (venture.studentId.toString() !== studentUserId) {
    throw new ForbiddenError('This venture does not belong to you');
  }
}
