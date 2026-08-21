import 'server-only';
import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { withTransaction } from '@/lib/db/transaction';
import { FacultyProfile, MentorProfile, StudentProfile, StudentVenture, User } from '@/models';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { containsPattern, exactPattern } from '@/lib/utils/regex';
import type { Role } from '@/lib/constants/roles';
import type {
  CreateUserInput,
  ImportStudentsInput,
  ListUsersInput,
  UpdateUserInput,
} from '@/validators/users';
import { logger } from '@/lib/logger';
import { splitUpdate } from '@/lib/db/updateDoc';

function blankToUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === '' || value === undefined) continue;
    output[key] = value;
  }
  return output as Partial<T>;
}

export interface UserListItem {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: string;
  createdAt: Date;
}

/**
 * Which profile collection carries the searchable detail for a role, and which
 * of its fields the directory actually shows.
 *
 * The directory's detail column is built from these, so searching them is what
 * makes the search box match what the reader can see. Without this, a search
 * for a roll number returns nothing while the roll number is on screen.
 */
const PROFILE_SEARCH_FIELDS = {
  STUDENT: ['rollNumber', 'batch', 'cluster'],
  FACULTY: ['designation', 'department', 'specialization'],
  MENTOR: ['company', 'designation', 'industry', 'expertise'],
} as const;

/** User ids whose role profile matches `q` on any of its searchable fields. */
async function userIdsMatchingProfile(
  role: Role | undefined,
  q: string,
): Promise<Types.ObjectId[]> {
  if (role !== 'STUDENT' && role !== 'FACULTY' && role !== 'MENTOR') return [];

  const pattern = containsPattern(q);
  const where = { $or: PROFILE_SEARCH_FIELDS[role].map((field) => ({ [field]: pattern })) };

  // Branching rather than indexing a model union: the three models have
  // different document types, so a shared variable erases the one thing
  // `.find()` needs to stay type-safe.
  const matches =
    role === 'STUDENT'
      ? await StudentProfile.find(where).select('userId').lean().exec()
      : role === 'FACULTY'
        ? await FacultyProfile.find(where).select('userId').lean().exec()
        : await MentorProfile.find(where).select('userId').lean().exec();

  return matches.map((profile) => profile.userId);
}

/** User ids in a batch. Exact, but case- and whitespace-insensitive. */
async function userIdsInBatch(batch: string): Promise<Types.ObjectId[]> {
  const matches = await StudentProfile.find({ batch: exactPattern(batch) })
    .select('userId')
    .lean()
    .exec();

  return matches.map((profile) => profile.userId);
}

/**
 * How many directory rows one screen loads.
 *
 * The table pages and sorts in the browser, so this is a memory bound rather
 * than a page size. It sits well above a realistic cohort; when a filtered set
 * does exceed it the screen says so instead of quietly showing a prefix.
 */
export const DIRECTORY_LIMIT = 500;

/**
 * The directory query.
 *
 * Every filter is applied in the database, not to an already-fetched page.
 * Filtering a page after the fact silently searches only the records that
 * happened to be in it — which is why the batch filter appeared to lose
 * students once an import pushed the cohort past one page.
 */
export async function listUsers(input: ListUsersInput & { batch?: string }) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (input.role) filter.role = input.role;
  if (input.status) filter.status = input.status;

  if (input.q) {
    const pattern = containsPattern(input.q);
    const profileMatches = await userIdsMatchingProfile(input.role, input.q);

    filter.$or = [
      { name: pattern },
      { email: pattern },
      ...(profileMatches.length > 0 ? [{ _id: { $in: profileMatches } }] : []),
    ];
  }

  // Batch lives on the student profile, so it narrows by id. `$in: []` when
  // nothing matches is correct and deliberate: "this batch, and it is empty".
  if (input.batch) {
    filter._id = { $in: await userIdsInBatch(input.batch) };
  }

  const skip = (input.page - 1) * input.pageSize;

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('name email phone role status createdAt')
      .sort({ name: 1 })
      .skip(skip)
      .limit(input.pageSize)
      .lean()
      .exec(),
    User.countDocuments(filter).exec(),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getUserWithProfile(userId: string) {
  await connectToDatabase();

  const user = await User.findById(userId)
    .select('name email phone role status createdAt')
    .lean()
    .exec();
  if (!user) throw new NotFoundError('User not found');

  const profile =
    user.role === 'STUDENT'
      ? await StudentProfile.findOne({ userId }).lean().exec()
      : user.role === 'FACULTY'
        ? await FacultyProfile.findOne({ userId }).lean().exec()
        : user.role === 'MENTOR'
          ? await MentorProfile.findOne({ userId }).lean().exec()
          : null;

  return { user, profile };
}

/** Creates the User and its role profile atomically. */
export async function createUser(input: CreateUserInput) {
  await connectToDatabase();

  const existing = await User.findOne({ email: input.email }).select('_id').lean().exec();
  if (existing) throw new ConflictError('A user with this email already exists');

  if (input.role === 'STUDENT') {
    const duplicateRoll = await StudentProfile.findOne({
      rollNumber: input.profile.rollNumber.toUpperCase(),
    })
      .select('_id')
      .lean()
      .exec();
    if (duplicateRoll) throw new ConflictError('A student with this roll number already exists');
  }

  return withTransaction(async (session) => {
    const [user] = await User.create(
      [
        {
          name: input.name,
          email: input.email,
          phone: input.phone || undefined,
          role: input.role,
          status: input.status,
        },
      ],
      { session: session ?? undefined },
    );

    const userId = user!._id;

    if (input.role === 'STUDENT') {
      await StudentProfile.create([{ userId, ...blankToUndefined(input.profile) }], {
        session: session ?? undefined,
      });
    } else if (input.role === 'FACULTY') {
      await FacultyProfile.create([{ userId, ...blankToUndefined(input.profile) }], {
        session: session ?? undefined,
      });
    } else if (input.role === 'MENTOR') {
      await MentorProfile.create([{ userId, ...blankToUndefined(input.profile) }], {
        session: session ?? undefined,
      });
    }

    logger.info('User created', { userId: userId.toString(), role: input.role });
    return { userId: userId.toString() };
  });
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  await connectToDatabase();

  const user = await User.findById(userId).exec();
  if (!user) throw new NotFoundError('User not found');

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone || undefined;
  if (input.status !== undefined) user.status = input.status;
  await user.save();

  if (input.profile) {
    // An empty field clears it. The schema still refuses to blank a required
    // one — an empty roll number is a validation error long before it gets
    // here, which is what keeps `$unset` from breaking a profile.
    const patch = splitUpdate(input.profile);

    // Branched rather than a shared variable: the three models have different
    // document types, and a union of them is not callable.
    if (Object.keys(patch).length > 0) {
      if (user.role === 'STUDENT') {
        await StudentProfile.updateOne({ userId }, patch, { upsert: false }).exec();
      } else if (user.role === 'FACULTY') {
        await FacultyProfile.updateOne({ userId }, patch, { upsert: false }).exec();
      } else if (user.role === 'MENTOR') {
        await MentorProfile.updateOne({ userId }, patch, { upsert: false }).exec();
      }
    }
  }

  logger.info('User updated', { userId, role: user.role });

  return { userId };
}

/**
 * Deactivation rather than deletion — reviews and submissions reference these
 * ids, and history must stay readable.
 */
export async function setUserStatus(userId: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
  await connectToDatabase();
  const result = await User.updateOne({ _id: userId }, { $set: { status } }).exec();
  if (result.matchedCount === 0) throw new NotFoundError('User not found');
  return { userId, status };
}

export interface ImportOutcome {
  created: number;
  skipped: Array<{ email: string; reason: string }>;
}

export async function importStudents(input: ImportStudentsInput): Promise<ImportOutcome> {
  await connectToDatabase();

  const outcome: ImportOutcome = { created: 0, skipped: [] };

  for (const row of input.students) {
    try {
      await createUser({
        role: 'STUDENT',
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: 'ACTIVE',
        profile: {
          rollNumber: row.rollNumber,
          batch: row.batch,
          cluster: row.cluster,
        },
      });
      outcome.created += 1;
    } catch (error) {
      outcome.skipped.push({
        email: row.email,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  logger.info('Student import finished', {
    created: outcome.created,
    skipped: outcome.skipped.length,
  });

  return outcome;
}

/** Faculty/Mentor pickers on the assignment screens. */
export async function listReviewersByRole(role: 'FACULTY' | 'MENTOR') {
  await connectToDatabase();
  return User.find({ role, status: 'ACTIVE' }).select('name email').sort({ name: 1 }).lean().exec();
}

export async function listStudentsWithoutVenture() {
  await connectToDatabase();

  const withVenture = await StudentVenture.find().select('studentId').lean().exec();
  const assigned = new Set(withVenture.map((v) => v.studentId.toString()));

  const students = await User.find({ role: 'STUDENT', status: 'ACTIVE' })
    .select('name email')
    .sort({ name: 1 })
    .lean()
    .exec();

  return students.filter((s) => !assigned.has(s._id.toString()));
}

export async function assertUserHasRole(userId: string, role: Role): Promise<void> {
  await connectToDatabase();
  const user = await User.findById(userId).select('role status').lean().exec();
  if (!user) throw new NotFoundError('User not found');
  if (user.role !== role) throw new ValidationError(`Selected user is not a ${role.toLowerCase()}`);
  if (user.status !== 'ACTIVE') throw new ValidationError('Selected user is not active');
}

export async function countByRole(): Promise<Record<Role, number>> {
  await connectToDatabase();

  const rows = await User.aggregate<{ _id: Role; count: number }>([
    { $match: { status: 'ACTIVE' } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]).exec();

  const counts: Record<Role, number> = { ADMIN: 0, STUDENT: 0, FACULTY: 0, MENTOR: 0 };
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}
