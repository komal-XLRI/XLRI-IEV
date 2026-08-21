import 'server-only';
import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  Subject,
  SubjectAttendance,
  SubjectFacultyAssignment,
  SubjectSession,
  SupportActivity,
  Term,
  User,
} from '@/models';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { splitUpdate } from '@/lib/db/updateDoc';
import { EXPERT_WORKSHOP_CODE } from '@/lib/constants/activities';
import type {
  CreateSubjectInput,
  CreateSubjectSessionInput,
  MarkAttendanceInput,
  UpsertTermInput,
} from '@/validators/academic';
import { assertUserHasRole } from '@/services/users/userService';

// ---------------------------------------------------------------- Terms ----

export async function listTerms() {
  await connectToDatabase();
  return Term.find().sort({ termNumber: 1 }).lean().exec();
}

export async function getTerm(termId: string) {
  await connectToDatabase();
  const term = await Term.findById(termId).lean().exec();
  if (!term) throw new NotFoundError('Term not found');
  return term;
}

/** Terms are fixed at three; this updates an existing one or creates it. */
export async function upsertTerm(input: UpsertTermInput) {
  await connectToDatabase();

  const term = await Term.findOneAndUpdate(
    { termNumber: input.termNumber },
    {
      $set: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
      },
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).exec();

  return term!.toObject();
}

// ------------------------------------------------------------- Subjects ----

export async function listSubjects(filters: { termId?: string; q?: string } = {}) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (filters.termId) filter.termId = filters.termId;
  if (filters.q) {
    const pattern = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }];
  }

  return Subject.find(filter)
    .populate<{ termId: { _id: unknown; termNumber: number; name: string } }>(
      'termId',
      'termNumber name',
    )
    .sort({ code: 1 })
    .lean()
    .exec();
}

export async function createSubject(input: CreateSubjectInput) {
  await connectToDatabase();

  const duplicate = await Subject.findOne({ code: input.code }).select('_id').lean().exec();
  if (duplicate) throw new ConflictError(`Subject code ${input.code} already exists`);

  await getTerm(input.termId);

  const subject = await Subject.create({
    code: input.code,
    name: input.name,
    credits: input.credits,
    area: input.area || undefined,
    termId: input.termId,
    description: input.description || undefined,
    status: input.status,
  });

  return subject.toObject();
}

export async function updateSubject(subjectId: string, input: Partial<CreateSubjectInput>) {
  await connectToDatabase();

  if (input.code) {
    const duplicate = await Subject.findOne({ code: input.code, _id: { $ne: subjectId } })
      .select('_id')
      .lean()
      .exec();
    if (duplicate) throw new ConflictError(`Subject code ${input.code} already exists`);
  }
  if (input.termId) await getTerm(input.termId);

  const subject = await Subject.findByIdAndUpdate(subjectId, splitUpdate(input), {
    returnDocument: 'after',
    runValidators: true,
  })
    .lean()
    .exec();

  if (!subject) throw new NotFoundError('Subject not found');
  return subject;
}

export async function deleteSubject(subjectId: string) {
  await connectToDatabase();

  const sessionCount = await SubjectSession.countDocuments({ subjectId }).exec();
  if (sessionCount > 0) {
    throw new ConflictError(
      'This subject has scheduled sessions. Set it to Inactive instead of deleting it.',
    );
  }

  await SubjectFacultyAssignment.deleteMany({ subjectId }).exec();
  const result = await Subject.deleteOne({ _id: subjectId }).exec();
  if (result.deletedCount === 0) throw new NotFoundError('Subject not found');
}

// ------------------------------------------- Subject faculty assignment ----

export async function getSubjectFaculty(subjectId: string) {
  await connectToDatabase();
  return SubjectFacultyAssignment.find({ subjectId })
    .populate<{ facultyId: { _id: Types.ObjectId; name: string; email: string } }>(
      'facultyId',
      'name email',
    )
    .lean()
    .exec();
}

/**
 * Replaces the teaching roster for a subject.
 *
 * Teaching a subject grants no venture-review rights whatsoever — that is
 * governed solely by StudentVenture.facultyId.
 */
export async function setSubjectFaculty(subjectId: string, facultyIds: string[]) {
  await connectToDatabase();

  const subject = await Subject.findById(subjectId).select('_id').lean().exec();
  if (!subject) throw new NotFoundError('Subject not found');

  for (const facultyId of facultyIds) {
    await assertUserHasRole(facultyId, 'FACULTY');
  }

  await SubjectFacultyAssignment.deleteMany({
    subjectId,
    facultyId: { $nin: facultyIds },
  }).exec();

  for (const facultyId of facultyIds) {
    await SubjectFacultyAssignment.updateOne(
      { subjectId, facultyId },
      { $setOnInsert: { subjectId, facultyId } },
      { upsert: true },
    ).exec();
  }

  return getSubjectFaculty(subjectId);
}

export async function listSubjectsForFaculty(facultyId: string) {
  await connectToDatabase();

  const assignments = await SubjectFacultyAssignment.find({ facultyId })
    .select('subjectId')
    .lean()
    .exec();
  const subjectIds = assignments.map((a) => a.subjectId);

  return Subject.find({ _id: { $in: subjectIds } })
    .populate<{ termId: { _id: unknown; termNumber: number; name: string } }>(
      'termId',
      'termNumber name',
    )
    .sort({ code: 1 })
    .lean()
    .exec();
}

// ------------------------------------------------------------- Sessions ----

export async function listSessions(
  filters: { subjectId?: string; facultyId?: string; supportActivityId?: string } = {},
) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (filters.subjectId) filter.subjectId = filters.subjectId;
  if (filters.facultyId) filter.facultyId = filters.facultyId;
  if (filters.supportActivityId) filter.supportActivityId = filters.supportActivityId;

  return SubjectSession.find(filter)
    .populate<{ subjectId: { _id: unknown; code: string; name: string } }>('subjectId', 'code name')
    .populate<{ facultyId: { _id: unknown; name: string } }>('facultyId', 'name')
    .populate<{ supportActivityId: { _id: unknown; activityCode: string; name: string } | null }>(
      'supportActivityId',
      'activityCode name',
    )
    .sort({ date: -1, startTime: 1 })
    .lean()
    .exec();
}

export async function createSubjectSession(input: CreateSubjectSessionInput) {
  await connectToDatabase();

  const subject = await Subject.findById(input.subjectId).select('_id').lean().exec();
  if (!subject) throw new NotFoundError('Subject not found');

  await assertUserHasRole(input.facultyId, 'FACULTY');

  if (input.supportActivityId) {
    const support = await SupportActivity.findById(input.supportActivityId)
      .select('_id activityCode')
      .lean()
      .exec();
    if (!support) throw new NotFoundError('Support activity not found');
  }

  const created = await SubjectSession.create({
    subjectId: input.subjectId,
    facultyId: input.facultyId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    sessionType: input.sessionType,
    supportActivityId: input.supportActivityId ?? null,
    topic: input.topic || undefined,
    notes: input.notes || undefined,
  });

  return created.toObject();
}

export async function updateSubjectSession(sessionId: string, input: Record<string, unknown>) {
  await connectToDatabase();

  const updated = await SubjectSession.findByIdAndUpdate(sessionId, splitUpdate(input), {
    returnDocument: 'after',
    runValidators: true,
  })
    .lean()
    .exec();

  if (!updated) throw new NotFoundError('Session not found');
  return updated;
}

export async function deleteSubjectSession(sessionId: string) {
  await connectToDatabase();
  await SubjectAttendance.deleteMany({ sessionId }).exec();
  const result = await SubjectSession.deleteOne({ _id: sessionId }).exec();
  if (result.deletedCount === 0) throw new NotFoundError('Session not found');
}

/**
 * Expert Workshops (A7) are surfaced through the sessions they are attached to
 * — there is no separate Workshop collection.
 *
 *   SupportActivity A7 → SubjectSession → Subject
 */
export async function listExpertWorkshopSessions() {
  const workshopId = await getExpertWorkshopId();
  if (!workshopId) return [];
  return listSessions({ supportActivityId: workshopId });
}

/** Id of the Expert Workshops support activity (A7), or null if unseeded. */
export async function getExpertWorkshopId(): Promise<string | null> {
  await connectToDatabase();

  const workshop = await SupportActivity.findOne({ activityCode: EXPERT_WORKSHOP_CODE })
    .select('_id')
    .lean()
    .exec();

  return workshop?._id.toString() ?? null;
}

// ----------------------------------------------------------- Attendance ----

export async function markAttendance(input: MarkAttendanceInput, markedBy: string) {
  await connectToDatabase();

  const session = await SubjectSession.findById(input.sessionId).select('_id').lean().exec();
  if (!session) throw new NotFoundError('Session not found');

  const studentIds = input.entries.map((e) => e.studentId);
  const students = await User.find({ _id: { $in: studentIds }, role: 'STUDENT' })
    .select('_id')
    .lean()
    .exec();

  if (students.length !== new Set(studentIds).size) {
    throw new ValidationError('One or more selected users are not students');
  }

  const markedAt = new Date();

  for (const entry of input.entries) {
    await SubjectAttendance.updateOne(
      { sessionId: input.sessionId, studentId: entry.studentId },
      {
        $set: {
          status: entry.status,
          remarks: entry.remarks || undefined,
          markedAt,
          markedBy,
        },
      },
      { upsert: true },
    ).exec();
  }

  return { sessionId: input.sessionId, marked: input.entries.length };
}

export async function getSessionAttendance(sessionId: string) {
  await connectToDatabase();
  return SubjectAttendance.find({ sessionId })
    .populate<{ studentId: { _id: unknown; name: string; email: string } }>(
      'studentId',
      'name email',
    )
    .lean()
    .exec();
}
