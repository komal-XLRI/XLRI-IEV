import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { withTransaction } from '@/lib/db/transaction';
import { FacultyProfile, MentorProfile, StudentProfile, StudentVenture, User } from '@/models';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { Role } from '@/lib/constants/roles';
import type {
  CreateUserInput,
  ImportStudentsInput,
  ListUsersInput,
  UpdateUserInput,
} from '@/validators/users';
import { logger } from '@/lib/logger';

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

export async function listUsers(input: ListUsersInput) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {};
  if (input.role) filter.role = input.role;
  if (input.status) filter.status = input.status;
  if (input.q) {
    const pattern = new RegExp(input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
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
    const patch = blankToUndefined(input.profile);
    if (Object.keys(patch).length > 0) {
      if (user.role === 'STUDENT') {
        await StudentProfile.updateOne({ userId }, { $set: patch }, { upsert: false }).exec();
      } else if (user.role === 'FACULTY') {
        await FacultyProfile.updateOne({ userId }, { $set: patch }, { upsert: false }).exec();
      } else if (user.role === 'MENTOR') {
        await MentorProfile.updateOne({ userId }, { $set: patch }, { upsert: false }).exec();
      }
    }
  }

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
