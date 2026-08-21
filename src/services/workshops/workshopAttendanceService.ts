import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentProfile, User, Workshop, WorkshopAttendance } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { containsPattern, exactPattern } from '@/lib/utils/regex';
import type { AttendanceMark } from '@/lib/constants/status';
import type { WorkshopMode, WorkshopStatus, WorkshopType } from '@/lib/constants/workshops';
import type { ReportFilters } from '@/validators/reportFilters';

/**
 * Workshop attendance.
 *
 * Kept beside the workshop services rather than inside the venture attendance
 * service: the two registers share a vocabulary but nothing else. This one has
 * no date (the workshop is the date), is keyed on the student rather than
 * their venture, and draws its roster from the cohort rather than from an
 * assignment table.
 *
 * Every number here is derived from `WorkshopAttendance` rows. A student with
 * no row has simply not been marked, which is not the same as being absent and
 * is never counted as one.
 */

/** Statuses a register may be taken for. */
const MARKABLE: WorkshopStatus[] = ['PUBLISHED', 'COMPLETED'];

function rate(present: number, records: number): number | null {
  return records === 0 ? null : Math.round((present / records) * 100);
}

// ------------------------------------------------------------ the roster ----

export interface WorkshopRosterRow {
  studentId: string;
  studentName: string;
  email: string;
  rollNumber: string;
  batch: string;
  /** Null when this student has not been marked. */
  status: AttendanceMark | null;
  remarks: string;
  markedAt: string | null;
  markedByName: string | null;
}

export interface WorkshopHeader {
  _id: string;
  title: string;
  workshopType: WorkshopType;
  date: string;
  startTime: string;
  endTime: string;
  mode: WorkshopMode;
  venue: string | null;
  status: WorkshopStatus;
  speakerName: string;
  /** False for a draft or a cancelled workshop — there was nothing to attend. */
  markable: boolean;
}

export interface WorkshopRoster {
  workshop: WorkshopHeader;
  rows: WorkshopRosterRow[];
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
}

function describeWorkshop(workshop: {
  _id: Types.ObjectId;
  title: string;
  workshopType: WorkshopType;
  date: Date;
  startTime: string;
  endTime: string;
  mode: WorkshopMode;
  venue?: string;
  status: WorkshopStatus;
  speakerName: string;
}): WorkshopHeader {
  return {
    _id: workshop._id.toString(),
    title: workshop.title,
    workshopType: workshop.workshopType,
    date: workshop.date.toISOString(),
    startTime: workshop.startTime,
    endTime: workshop.endTime,
    mode: workshop.mode,
    venue: workshop.venue ?? null,
    status: workshop.status,
    speakerName: workshop.speakerName,
    markable: MARKABLE.includes(workshop.status),
  };
}

/**
 * Who was expected at a workshop, and what they are marked as.
 *
 * The roster is every active student — the same audience the announcement
 * email goes to, so the register covers exactly the people who were told about
 * it. Building it from the attendance rows instead would show only the people
 * already marked, which is the opposite of what somebody taking a register
 * needs to see.
 */
export async function getWorkshopRoster(
  workshopId: string,
  filters: { q?: string; batch?: string } = {},
): Promise<WorkshopRoster> {
  await connectToDatabase();

  const workshop = await Workshop.findById(workshopId)
    .select('title workshopType date startTime endTime mode venue status speakerName')
    .lean()
    .exec();

  if (!workshop) throw new NotFoundError('Workshop not found');

  const [students, marks] = await Promise.all([
    User.find({ role: 'STUDENT', status: 'ACTIVE' })
      .select('name email')
      .sort({ name: 1 })
      .lean()
      .exec(),
    WorkshopAttendance.find({ workshopId })
      .populate<{ markedBy: { name: string } | null }>('markedBy', 'name')
      .lean()
      .exec(),
  ]);

  const profiles = await StudentProfile.find({ userId: { $in: students.map((s) => s._id) } })
    .select('userId rollNumber batch')
    .lean()
    .exec();

  const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));
  const markByStudent = new Map(marks.map((mark) => [mark.studentId.toString(), mark]));

  const needle = filters.q?.trim().toLowerCase();

  const rows: WorkshopRosterRow[] = students
    .map((student) => {
      const studentId = student._id.toString();
      const profile = profileByUser.get(studentId);
      const mark = markByStudent.get(studentId);

      return {
        studentId,
        studentName: student.name,
        email: student.email,
        rollNumber: profile?.rollNumber ?? '',
        batch: profile?.batch ?? '',
        status: mark?.status ?? null,
        remarks: mark?.remarks ?? '',
        markedAt: mark?.markedAt ? mark.markedAt.toISOString() : null,
        markedByName: mark?.markedBy?.name ?? null,
      };
    })
    .filter((row) => {
      if (filters.batch && row.batch !== filters.batch) return false;
      if (!needle) return true;
      return `${row.studentName} ${row.rollNumber} ${row.email}`.toLowerCase().includes(needle);
    });

  const present = rows.filter((row) => row.status === 'PRESENT').length;
  const absent = rows.filter((row) => row.status === 'ABSENT').length;

  return {
    workshop: describeWorkshop(workshop),
    rows,
    present,
    absent,
    unmarked: rows.length - present - absent,
    attendanceRate: rate(present, present + absent),
  };
}

// ----------------------------------------------------------- the summary ----

export interface WorkshopAttendanceRow extends WorkshopHeader {
  /** Active students, so a row can say "18 of 42 marked". */
  expected: number;
  present: number;
  absent: number;
  records: number;
  unmarked: number;
  attendanceRate: number | null;
}

export interface WorkshopAttendanceTotals {
  workshops: number;
  expected: number;
  /**
   * Students who exist but are not on any register, because their account is
   * not active.
   *
   * Surfaced rather than left implicit: the roster is deliberately the same
   * audience as the announcement email, so a deactivated student is invisible
   * to both — and a register that quietly covers three of forty people looks
   * identical to one that covers everybody.
   */
  excluded: number;
  records: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

export interface WorkshopAttendanceBoard {
  rows: WorkshopAttendanceRow[];
  totals: WorkshopAttendanceTotals;
}

/**
 * Attendance across workshops, one row per workshop.
 *
 * Drafts and cancelled workshops are listed rather than hidden: an
 * administrator looking for "which registers still need taking" has to be able
 * to see that a workshop is not markable, and silently omitting it reads as
 * "already done".
 */
export async function getWorkshopAttendanceBoard(
  filters: ReportFilters = {},
): Promise<WorkshopAttendanceBoard> {
  await connectToDatabase();

  const query: Record<string, unknown> = {};

  if (filters.workshopType) query.workshopType = filters.workshopType;
  if (filters.workshopMode) query.mode = filters.workshopMode;
  if (filters.workshopStatus) query.status = filters.workshopStatus;
  if (filters.q) query.title = containsPattern(filters.q);

  if (filters.dateFrom || filters.dateTo) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (filters.dateFrom) range.$gte = filters.dateFrom;
    if (filters.dateTo) range.$lte = filters.dateTo;
    query.date = range;
  }

  const [workshops, expected] = await Promise.all([
    Workshop.find(query)
      .select('title workshopType date startTime endTime mode venue status speakerName')
      .sort({ date: -1 })
      .lean()
      .exec(),
    countExpectedStudents(filters.batch),
  ]);

  const excluded = await User.countDocuments({
    role: 'STUDENT',
    status: { $ne: 'ACTIVE' },
  }).exec();

  const marks = await WorkshopAttendance.find({
    workshopId: { $in: workshops.map((workshop) => workshop._id) },
    ...(await batchScope(filters.batch)),
  })
    .select('workshopId status')
    .lean()
    .exec();

  const tally = new Map<string, { present: number; absent: number }>();
  for (const mark of marks) {
    const key = mark.workshopId.toString();
    const bucket = tally.get(key) ?? { present: 0, absent: 0 };
    if (mark.status === 'PRESENT') bucket.present += 1;
    else bucket.absent += 1;
    tally.set(key, bucket);
  }

  const rows: WorkshopAttendanceRow[] = workshops.map((workshop) => {
    const bucket = tally.get(workshop._id.toString()) ?? { present: 0, absent: 0 };
    const records = bucket.present + bucket.absent;

    return {
      ...describeWorkshop(workshop),
      expected,
      present: bucket.present,
      absent: bucket.absent,
      records,
      unmarked: Math.max(0, expected - records),
      attendanceRate: rate(bucket.present, records),
    };
  });

  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const absent = rows.reduce((sum, row) => sum + row.absent, 0);

  return {
    rows,
    totals: {
      workshops: rows.length,
      expected,
      excluded,
      records: present + absent,
      present,
      absent,
      attendanceRate: rate(present, present + absent),
    },
  };
}

/** The cohort a register covers — every active student, or one batch of them. */
async function countExpectedStudents(batch?: string): Promise<number> {
  if (!batch) return User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }).exec();

  const profiles = await StudentProfile.find({ batch: exactPattern(batch) })
    .select('userId')
    .lean()
    .exec();

  return User.countDocuments({
    _id: { $in: profiles.map((profile) => profile.userId) },
    role: 'STUDENT',
    status: 'ACTIVE',
  }).exec();
}

/** Narrows attendance rows to one batch, resolved through the profiles. */
async function batchScope(batch?: string): Promise<Record<string, unknown>> {
  if (!batch) return {};

  const profiles = await StudentProfile.find({ batch: exactPattern(batch) })
    .select('userId')
    .lean()
    .exec();

  return { studentId: { $in: profiles.map((profile) => profile.userId) } };
}

// ------------------------------------------------------------- the write ----

export interface WorkshopAttendanceEntry {
  studentId: string;
  status: AttendanceMark;
  remarks?: string;
}

/**
 * Records a workshop register in one submit.
 *
 * An upsert against the unique `(workshop, student)` index, so saving the same
 * register twice corrects it rather than doubling it. `cleared` names the
 * students whose mark is being taken back off: an omitted student reads as
 * "unchanged", so silence cannot also mean "delete".
 */
export async function saveWorkshopAttendance(input: {
  workshopId: string;
  entries: WorkshopAttendanceEntry[];
  cleared?: string[];
  markedBy: string;
}): Promise<{ marked: number; cleared: number }> {
  await connectToDatabase();

  const workshopId = new Types.ObjectId(input.workshopId);

  const workshop = await Workshop.findById(input.workshopId).select('status').lean().exec();
  if (!workshop) throw new NotFoundError('Workshop not found');

  // A draft was never announced and a cancelled workshop did not happen, so
  // neither has a register to take.
  if (!MARKABLE.includes(workshop.status)) {
    throw new ValidationError(
      `Attendance cannot be recorded for a ${workshop.status.toLowerCase()} workshop`,
    );
  }

  // A student cannot be marked and unmarked in the same submit; if a caller
  // says both, the mark wins, because it is the more specific instruction.
  const marking = new Set(input.entries.map((entry) => entry.studentId));
  const clearing = (input.cleared ?? []).filter((id) => !marking.has(id));

  // Checked before anything is written, clears included: a register that
  // rejects half of itself after deleting the other half is the partially
  // applied state that makes an import impossible to reason about.
  if (input.entries.length > 0) {
    const students = await User.find({
      _id: { $in: input.entries.map((entry) => new Types.ObjectId(entry.studentId)) },
      role: 'STUDENT',
    })
      .select('_id')
      .lean()
      .exec();

    if (students.length !== marking.size) {
      throw new ValidationError('One or more of those people are not student accounts');
    }
  }

  const removal =
    clearing.length > 0
      ? await WorkshopAttendance.deleteMany({
          workshopId,
          studentId: { $in: clearing.map((id) => new Types.ObjectId(id)) },
        }).exec()
      : null;

  const cleared = removal?.deletedCount ?? 0;

  if (input.entries.length === 0) return { marked: 0, cleared };

  const markedAt = new Date();
  const markedById = new Types.ObjectId(input.markedBy);

  await WorkshopAttendance.bulkWrite(
    input.entries.map((entry) => {
      const remark = entry.remarks?.trim();

      return {
        updateOne: {
          filter: { workshopId, studentId: new Types.ObjectId(entry.studentId) },
          update: {
            $set: {
              status: entry.status,
              markedAt,
              markedBy: markedById,
              ...(remark ? { remarks: remark } : {}),
            },
            // Mongo ignores an undefined value, so removing a remark has to be
            // said explicitly or the previous one survives the edit.
            ...(remark ? {} : { $unset: { remarks: '' } }),
          },
          upsert: true,
        },
      };
    }),
  );

  return { marked: input.entries.length, cleared };
}

// --------------------------------------------------- the pasted attendee ----

export interface AttendeeMatch {
  /** Students whose email appeared in the pasted list. */
  matched: Array<{ studentId: string; studentName: string; email: string }>;
  /** Addresses in the list that belong to no active student. */
  unmatched: string[];
  /** Addresses that appeared more than once in the list. */
  duplicates: string[];
}

/**
 * Turns a pasted attendee list into students.
 *
 * An online workshop produces its register somewhere else — a Zoom or Meet
 * export, or the sign-in sheet typed up afterwards — and retyping forty names
 * into a form is how a register stops being taken at all.
 *
 * This only *resolves*; it writes nothing. The dialog pre-selects the matches
 * and the administrator saves, so a paste that matched the wrong people is
 * still reviewable before it lands. Addresses that match nobody are returned
 * rather than dropped: a silently ignored line is a student silently missing
 * from the register.
 */
export async function matchWorkshopAttendees(text: string): Promise<AttendeeMatch> {
  await connectToDatabase();

  // Accepts a column pasted from a spreadsheet, a comma-separated list, or a
  // Zoom export where the address sits inside "Name <a@b.c>".
  const candidates = text
    .split(/[\s,;]+/)
    .map((token) =>
      token
        .trim()
        .replace(/^[<("']+|[>)"',.]+$/g, '')
        .toLowerCase(),
    )
    .filter((token) => token.includes('@'));

  if (candidates.length === 0) {
    throw new ValidationError('No email addresses found in that list');
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      if (!duplicates.includes(candidate)) duplicates.push(candidate);
      continue;
    }
    seen.add(candidate);
    unique.push(candidate);
  }

  const students = await User.find({ email: { $in: unique }, role: 'STUDENT', status: 'ACTIVE' })
    .select('name email')
    .lean()
    .exec();

  const byEmail = new Map(students.map((student) => [student.email.toLowerCase(), student]));

  return {
    matched: students.map((student) => ({
      studentId: student._id.toString(),
      studentName: student.name,
      email: student.email,
    })),
    unmatched: unique.filter((address) => !byEmail.has(address)),
    duplicates,
  };
}

// ---------------------------------------------------------- student view ----

export interface StudentWorkshopMark {
  workshopId: string;
  status: AttendanceMark;
  remarks: string;
}

/**
 * One student's own workshop marks, keyed by workshop.
 *
 * Read-only by construction: nothing on this path writes, and the page that
 * renders it has no form and no action.
 */
export async function getStudentWorkshopAttendance(
  studentId: string,
): Promise<Map<string, StudentWorkshopMark>> {
  await connectToDatabase();

  const marks = await WorkshopAttendance.find({ studentId })
    .select('workshopId status remarks')
    .lean()
    .exec();

  return new Map(
    marks.map((mark) => [
      mark.workshopId.toString(),
      {
        workshopId: mark.workshopId.toString(),
        status: mark.status,
        remarks: mark.remarks ?? '',
      },
    ]),
  );
}
