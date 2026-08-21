import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  StudentProfile,
  StudentVenture,
  StudentVentureActivity,
  User,
  VentureActivity,
  VentureActivityAttendance,
  attendanceDay,
} from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { applyScope, resolveActivityScope, resolveVentureScope } from '@/services/reports/scope';
import type { ReportFilters } from '@/validators/reportFilters';
import { windowState, type DateWindowState } from '@/lib/utils/dates';
import type { AttendanceMark } from '@/lib/constants/status';

/**
 * Attendance on Venture Activities.
 *
 * Kept apart from `studentVentureService`, which owns the rules that decide
 * what a student may do next. Nothing here participates in those rules:
 * attendance is a register the programme office keeps, and marking a student
 * absent does not lock an activity, consume an attempt or fail a review. That
 * separation is the point — a future reader looking for what gates progression
 * should not find this file in the way.
 *
 * Every number below is derived from `VentureActivityAttendance` rows. A
 * student with no row for a date has simply not been marked, which is not the
 * same as being absent and is never counted as one.
 */

// ------------------------------------------------------------ the roster ----

/** One student on an activity, with their mark for the date being taken. */
export interface AttendanceRosterRow {
  studentVentureId: string;
  ventureName: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  batch: string;
  /** Null when this student has not been marked for this date. */
  status: AttendanceMark | null;
  remarks: string;
  markedAt: string | null;
  markedByName: string | null;
}

export interface AttendanceActivityHeader {
  _id: string;
  activityCode: string;
  name: string;
  order: number;
  termName: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  windowState: DateWindowState | null;
}

export interface AttendanceDateSummary {
  date: string;
  present: number;
  absent: number;
  marked: number;
}

export interface AttendanceRoster {
  activity: AttendanceActivityHeader;
  date: string;
  rows: AttendanceRosterRow[];
  /** Dates this activity already has a register for, newest first. */
  history: AttendanceDateSummary[];
}

/**
 * Who should be on the register for an activity, and what they are marked as.
 *
 * The roster is built from `StudentVentureActivity` — the students actually
 * assigned to this activity — with marks layered on top. Building it the other
 * way round, from the attendance rows, would silently drop everyone nobody has
 * marked yet, which is precisely who the person taking a register needs to see.
 */
export async function getAttendanceRoster(
  ventureActivityId: string,
  date: Date,
): Promise<AttendanceRoster> {
  await connectToDatabase();

  const activity = await VentureActivity.findById(ventureActivityId)
    .select('activityCode name order termId startDate endDate durationDays')
    .populate<{ termId: { name: string } | null }>('termId', 'name')
    .lean()
    .exec();

  if (!activity) throw new NotFoundError('Venture activity not found');

  const day = attendanceDay(date);

  const [assignments, marks, history] = await Promise.all([
    StudentVentureActivity.find({ ventureActivityId }).select('studentVentureId').lean().exec(),
    VentureActivityAttendance.find({ ventureActivityId, date: day })
      .populate<{ markedBy: { name: string } | null }>('markedBy', 'name')
      .lean()
      .exec(),
    listAttendanceDates(ventureActivityId),
  ]);

  const ventures = await StudentVenture.find({
    _id: { $in: assignments.map((record) => record.studentVentureId) },
  })
    .select('ventureName studentId')
    .lean()
    .exec();

  const [students, profiles] = await Promise.all([
    User.find({ _id: { $in: ventures.map((venture) => venture.studentId) } })
      .select('name')
      .lean()
      .exec(),
    StudentProfile.find({ userId: { $in: ventures.map((venture) => venture.studentId) } })
      .select('userId rollNumber batch')
      .lean()
      .exec(),
  ]);

  const studentById = new Map(students.map((student) => [student._id.toString(), student]));
  const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));
  const markByVenture = new Map(marks.map((mark) => [mark.studentVentureId.toString(), mark]));

  const rows: AttendanceRosterRow[] = ventures
    .map((venture) => {
      const studentId = String(venture.studentId);
      const mark = markByVenture.get(venture._id.toString());

      return {
        studentVentureId: venture._id.toString(),
        ventureName: venture.ventureName,
        studentId,
        studentName: studentById.get(studentId)?.name ?? 'Unknown student',
        rollNumber: profileByUser.get(studentId)?.rollNumber ?? '',
        batch: profileByUser.get(studentId)?.batch ?? '',
        status: mark?.status ?? null,
        remarks: mark?.remarks ?? '',
        markedAt: mark?.markedAt ? mark.markedAt.toISOString() : null,
        markedByName: mark?.markedBy?.name ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return {
    activity: describeActivity(activity),
    date: day.toISOString(),
    rows,
    history,
  };
}

/** Every date an activity has a register for, newest first. */
export async function listAttendanceDates(
  ventureActivityId: string,
): Promise<AttendanceDateSummary[]> {
  await connectToDatabase();

  const grouped = await VentureActivityAttendance.aggregate<{
    _id: Date;
    present: number;
    absent: number;
  }>([
    // Cast explicitly: Mongoose does not apply schema casting inside a pipeline.
    { $match: { ventureActivityId: new Types.ObjectId(ventureActivityId) } },
    {
      $group: {
        _id: '$date',
        present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
      },
    },
    { $sort: { _id: -1 } },
  ]).exec();

  return grouped.map((row) => ({
    date: new Date(row._id).toISOString(),
    present: row.present,
    absent: row.absent,
    marked: row.present + row.absent,
  }));
}

function describeActivity(activity: {
  _id: Types.ObjectId;
  activityCode: string;
  name: string;
  order: number;
  termId?: { name: string } | null;
  startDate?: Date | null;
  endDate?: Date | null;
  durationDays: number;
}): AttendanceActivityHeader {
  return {
    _id: activity._id.toString(),
    activityCode: activity.activityCode,
    name: activity.name,
    order: activity.order,
    termName: activity.termId?.name ?? null,
    startDate: activity.startDate ? activity.startDate.toISOString() : null,
    endDate: activity.endDate ? activity.endDate.toISOString() : null,
    durationDays: activity.durationDays,
    windowState:
      activity.startDate && activity.endDate
        ? windowState(activity.startDate, activity.endDate, new Date())
        : null,
  };
}

// ----------------------------------------------------------- the summary ----

export interface AttendanceActivityRow extends AttendanceActivityHeader {
  /** Students assigned to this activity — the size of a full register. */
  students: number;
  /** Distinct dates a register has been taken on. */
  sessions: number;
  /** Attendance rows recorded, across every date. */
  records: number;
  present: number;
  absent: number;
  /**
   * Present as a share of the records that exist, or null when none do. A
   * register nobody has taken is not 0% attendance, and reporting it as one
   * invents a problem nobody has.
   */
  attendanceRate: number | null;
}

export interface AttendanceTotals {
  activities: number;
  students: number;
  sessions: number;
  records: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

export interface AttendanceBoard {
  rows: AttendanceActivityRow[];
  totals: AttendanceTotals;
  /** Every activity defined, so a filtered row can still say "#3 of 12". */
  activityCount: number;
}

function rate(present: number, records: number): number | null {
  return records === 0 ? null : Math.round((present / records) * 100);
}

/**
 * The register overview, one row per Venture Activity.
 *
 * Filters are applied inside the queries rather than to already-fetched rows:
 * the counts on a row have to describe the ventures and dates in scope, and a
 * row assembled from everything and then trimmed cannot.
 */
export async function getAttendanceBoard(filters: ReportFilters = {}): Promise<AttendanceBoard> {
  await connectToDatabase();

  const [ventureScope, activityScope, activityCount] = await Promise.all([
    resolveVentureScope(filters),
    resolveActivityScope(filters),
    VentureActivity.countDocuments().exec(),
  ]);

  const activities = await VentureActivity.find(
    activityScope === null ? {} : { _id: { $in: activityScope } },
  )
    .select('activityCode name order termId startDate endDate durationDays')
    .populate<{ termId: { name: string } | null }>('termId', 'name')
    .sort({ order: 1 })
    .lean()
    .exec();

  const activityIds = activities.map((activity) => activity._id);

  const attendanceQuery: Record<string, unknown> = { ventureActivityId: { $in: activityIds } };
  applyScope(attendanceQuery, 'studentVentureId', ventureScope);
  if (filters.attendanceStatus) attendanceQuery.status = filters.attendanceStatus;

  const range = dateWindow(filters);
  if (range) attendanceQuery.date = range;

  const assignmentQuery: Record<string, unknown> = { ventureActivityId: { $in: activityIds } };
  applyScope(assignmentQuery, 'studentVentureId', ventureScope);

  const [marks, assignments] = await Promise.all([
    VentureActivityAttendance.find(attendanceQuery)
      .select('ventureActivityId studentVentureId date status')
      .lean()
      .exec(),
    StudentVentureActivity.find(assignmentQuery).select('ventureActivityId').lean().exec(),
  ]);

  const assigned = new Map<string, number>();
  for (const record of assignments) {
    const key = record.ventureActivityId.toString();
    assigned.set(key, (assigned.get(key) ?? 0) + 1);
  }

  const tally = new Map<string, { present: number; absent: number; dates: Set<string> }>();
  for (const mark of marks) {
    const key = mark.ventureActivityId.toString();
    const bucket = tally.get(key) ?? { present: 0, absent: 0, dates: new Set<string>() };

    if (mark.status === 'PRESENT') bucket.present += 1;
    else bucket.absent += 1;
    bucket.dates.add(mark.date.toISOString());

    tally.set(key, bucket);
  }

  const rows: AttendanceActivityRow[] = activities.map((activity) => {
    const key = activity._id.toString();
    const bucket = tally.get(key) ?? { present: 0, absent: 0, dates: new Set<string>() };
    const records = bucket.present + bucket.absent;

    return {
      ...describeActivity(activity),
      students: assigned.get(key) ?? 0,
      sessions: bucket.dates.size,
      records,
      present: bucket.present,
      absent: bucket.absent,
      attendanceRate: rate(bucket.present, records),
    };
  });

  const totals = rows.reduce<AttendanceTotals>(
    (running, row) => ({
      activities: running.activities + 1,
      // The cohort, not a sum: the same students appear on every activity.
      students: Math.max(running.students, row.students),
      sessions: running.sessions + row.sessions,
      records: running.records + row.records,
      present: running.present + row.present,
      absent: running.absent + row.absent,
      attendanceRate: null,
    }),
    {
      activities: 0,
      students: 0,
      sessions: 0,
      records: 0,
      present: 0,
      absent: 0,
      attendanceRate: null,
    },
  );

  totals.attendanceRate = rate(totals.present, totals.records);

  return { rows, totals, activityCount };
}

/** Inclusive date window from the shared filter vocabulary, normalised to days. */
function dateWindow(filters: ReportFilters): { $gte?: Date; $lte?: Date } | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;

  const clause: { $gte?: Date; $lte?: Date } = {};
  if (filters.dateFrom) clause.$gte = attendanceDay(filters.dateFrom);
  if (filters.dateTo) clause.$lte = attendanceDay(filters.dateTo);
  return clause;
}

// ------------------------------------------------------------- the write ----

export interface AttendanceEntry {
  studentVentureId: string;
  status: AttendanceMark;
  remarks?: string;
}

/**
 * Records a register for one activity on one date.
 *
 * An upsert against the unique `(activity, venture, date)` index, so saving the
 * same register twice corrects it rather than doubling it — which is what makes
 * "edit attendance later" work with no separate update path.
 *
 * Every row carries `markedBy` and `markedAt`, rewritten on each save: the
 * question a disputed absence asks is who said so and when, and the answer has
 * to be the most recent one.
 */
export async function saveAttendance(input: {
  ventureActivityId: string;
  date: Date;
  entries: AttendanceEntry[];
  /** Students being returned to unmarked, which deletes their row for the date. */
  cleared?: string[];
  markedBy: string;
}): Promise<{ date: string; marked: number; cleared: number }> {
  await connectToDatabase();

  const day = attendanceDay(input.date);
  const activityId = new Types.ObjectId(input.ventureActivityId);

  const activity = await VentureActivity.findById(input.ventureActivityId)
    .select('_id')
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  // A student cannot be marked and unmarked in the same submit; if a caller
  // says both, the mark wins, because it is the more specific instruction.
  const marking = new Set(input.entries.map((entry) => entry.studentVentureId));
  const clearing = (input.cleared ?? []).filter((id) => !marking.has(id));

  // Only students actually on this activity may be marked for it. Without this
  // a crafted post could file attendance against a venture that is not on the
  // register, and nothing downstream would notice.
  //
  // Checked before anything is written, clears included: a register that
  // rejects half of itself after having already deleted the other half is
  // exactly the partially applied state the all-or-nothing rule exists to stop.
  if (input.entries.length > 0) {
    const assigned = await StudentVentureActivity.find({
      ventureActivityId: input.ventureActivityId,
      studentVentureId: { $in: input.entries.map((entry) => entry.studentVentureId) },
    })
      .select('studentVentureId')
      .lean()
      .exec();

    const allowed = new Set(assigned.map((record) => record.studentVentureId.toString()));
    if (input.entries.some((entry) => !allowed.has(entry.studentVentureId))) {
      throw new ValidationError('One or more students are not assigned to this venture activity');
    }
  }

  // Scoped to this activity and date, so a clear can only ever remove a row
  // from the register it was submitted against.
  const removal =
    clearing.length > 0
      ? await VentureActivityAttendance.deleteMany({
          ventureActivityId: activityId,
          studentVentureId: { $in: clearing.map((id) => new Types.ObjectId(id)) },
          date: day,
        }).exec()
      : null;

  const cleared = removal?.deletedCount ?? 0;

  if (input.entries.length === 0) return { date: day.toISOString(), marked: 0, cleared };

  const markedAt = new Date();

  const markedById = new Types.ObjectId(input.markedBy);

  await VentureActivityAttendance.bulkWrite(
    input.entries.map((entry) => {
      const remark = entry.remarks?.trim();

      return {
        updateOne: {
          filter: {
            ventureActivityId: activityId,
            studentVentureId: new Types.ObjectId(entry.studentVentureId),
            date: day,
          },
          update: {
            $set: {
              status: entry.status,
              markedAt,
              markedBy: markedById,
              ...(remark ? { remarks: remark } : {}),
            },
            // Clearing a remark has to be said explicitly: Mongo ignores an
            // undefined value, so `$set: { remarks: undefined }` would keep the
            // previous one on an edit that removed it.
            ...(remark ? {} : { $unset: { remarks: '' } }),
          },
          upsert: true,
        },
      };
    }),
  );

  return { date: day.toISOString(), marked: input.entries.length, cleared };
}

/** Removes one student's mark for a date, returning them to "not marked". */
export async function clearAttendance(input: {
  ventureActivityId: string;
  studentVentureId: string;
  date: Date;
}): Promise<{ cleared: number }> {
  await connectToDatabase();

  const result = await VentureActivityAttendance.deleteOne({
    ventureActivityId: input.ventureActivityId,
    studentVentureId: input.studentVentureId,
    date: attendanceDay(input.date),
  }).exec();

  return { cleared: result.deletedCount ?? 0 };
}

// ---------------------------------------------------------- student view ----

export interface StudentAttendanceActivity {
  ventureActivityId: string;
  activityCode: string;
  name: string;
  order: number;
  sessions: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
  marks: Array<{ date: string; status: AttendanceMark; remarks: string }>;
}

export interface StudentAttendance {
  activities: StudentAttendanceActivity[];
  totals: { sessions: number; present: number; absent: number; attendanceRate: number | null };
}

/**
 * One student's own attendance, grouped by activity.
 *
 * Read-only by construction: nothing on this path writes, and the page that
 * renders it has no form and no action.
 */
export async function getStudentAttendance(studentVentureId: string): Promise<StudentAttendance> {
  await connectToDatabase();

  const venture = await StudentVenture.findById(studentVentureId).select('_id').lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  const [marks, activities] = await Promise.all([
    VentureActivityAttendance.find({ studentVentureId })
      .select('ventureActivityId date status remarks')
      .sort({ date: -1 })
      .lean()
      .exec(),
    VentureActivity.find().select('activityCode name order').sort({ order: 1 }).lean().exec(),
  ]);

  const byActivity = new Map<string, typeof marks>();
  for (const mark of marks) {
    const key = mark.ventureActivityId.toString();
    byActivity.set(key, [...(byActivity.get(key) ?? []), mark]);
  }

  // Only activities the student has actually been marked on. Listing all twelve
  // with "no sessions" would bury the two that carry real information.
  const rows: StudentAttendanceActivity[] = activities
    .filter((activity) => byActivity.has(activity._id.toString()))
    .map((activity) => {
      const own = byActivity.get(activity._id.toString()) ?? [];
      const present = own.filter((mark) => mark.status === 'PRESENT').length;
      const absent = own.length - present;

      return {
        ventureActivityId: activity._id.toString(),
        activityCode: activity.activityCode,
        name: activity.name,
        order: activity.order,
        sessions: own.length,
        present,
        absent,
        attendanceRate: rate(present, own.length),
        marks: own.map((mark) => ({
          date: mark.date.toISOString(),
          status: mark.status,
          remarks: mark.remarks ?? '',
        })),
      };
    });

  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const absent = rows.reduce((sum, row) => sum + row.absent, 0);

  return {
    activities: rows,
    totals: {
      sessions: present + absent,
      present,
      absent,
      attendanceRate: rate(present, present + absent),
    },
  };
}

// ------------------------------------------------------- consolidated -------

/** One student's attendance on one activity. */
export interface ConsolidatedCell {
  ventureActivityId: string;
  /** Whether this student is on the activity at all. */
  assigned: boolean;
  records: number;
  present: number;
  absent: number;
  /**
   * Register dates this student has no row on.
   *
   * A gap in the register, not an absence — the whole reason attendance moved
   * off a single column is that those two facts are different, and a
   * consolidated view is where conflating them does the most damage.
   */
  unmarked: number;
  attendanceRate: number | null;
}

export interface ConsolidatedStudentRow {
  studentVentureId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  batch: string;
  ventureName: string;
  /** One cell per column, in column order. */
  cells: ConsolidatedCell[];
  records: number;
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
}

export interface ConsolidatedColumn extends AttendanceActivityHeader {
  /** Dates this activity has a register for. */
  sessions: number;
  records: number;
  present: number;
  absent: number;
  attendanceRate: number | null;
}

export interface ConsolidatedAttendance {
  columns: ConsolidatedColumn[];
  rows: ConsolidatedStudentRow[];
  totals: AttendanceTotals & { unmarked: number };
}

/**
 * Every student against every activity, in one grid.
 *
 * The register answers "who was here on this date"; this answers "how is the
 * cohort doing overall", which is the question a programme office actually
 * reports on. Rows are built from the assignments, so a student who has never
 * been marked still appears — as a row of gaps, which is the finding.
 *
 * `filters.attendanceStatus` is deliberately ignored here. A grid of present
 * and absent counts narrowed to one of them is not a smaller version of the
 * same table, it is a misleading one: every Absent column would read zero.
 */
export async function getConsolidatedAttendance(
  filters: ReportFilters = {},
): Promise<ConsolidatedAttendance> {
  await connectToDatabase();

  const [ventureScope, activityScope] = await Promise.all([
    resolveVentureScope(filters),
    resolveActivityScope(filters),
  ]);

  const activities = await VentureActivity.find(
    activityScope === null ? {} : { _id: { $in: activityScope } },
  )
    .select('activityCode name order termId startDate endDate durationDays')
    .populate<{ termId: { name: string } | null }>('termId', 'name')
    .sort({ order: 1 })
    .lean()
    .exec();

  const activityIds = activities.map((activity) => activity._id);

  const assignmentQuery: Record<string, unknown> = { ventureActivityId: { $in: activityIds } };
  applyScope(assignmentQuery, 'studentVentureId', ventureScope);

  const markQuery: Record<string, unknown> = { ventureActivityId: { $in: activityIds } };
  applyScope(markQuery, 'studentVentureId', ventureScope);

  const range = dateWindow(filters);
  if (range) markQuery.date = range;

  const [assignments, marks] = await Promise.all([
    StudentVentureActivity.find(assignmentQuery)
      .select('ventureActivityId studentVentureId')
      .lean()
      .exec(),
    VentureActivityAttendance.find(markQuery)
      .select('ventureActivityId studentVentureId date status')
      .lean()
      .exec(),
  ]);

  const ventureIds = [...new Set(assignments.map((record) => record.studentVentureId.toString()))];

  const ventures = await StudentVenture.find({ _id: { $in: ventureIds } })
    .select('ventureName studentId')
    .lean()
    .exec();

  const [students, profiles] = await Promise.all([
    User.find({ _id: { $in: ventures.map((venture) => venture.studentId) } })
      .select('name')
      .lean()
      .exec(),
    StudentProfile.find({ userId: { $in: ventures.map((venture) => venture.studentId) } })
      .select('userId rollNumber batch')
      .lean()
      .exec(),
  ]);

  const studentById = new Map(students.map((student) => [student._id.toString(), student]));
  const profileByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));

  const assigned = new Set(
    assignments.map(
      (record) => `${record.studentVentureId.toString()}:${record.ventureActivityId.toString()}`,
    ),
  );

  const cells = new Map<string, { present: number; absent: number; dates: Set<string> }>();
  const datesByActivity = new Map<string, Set<string>>();

  for (const mark of marks) {
    const activityKey = mark.ventureActivityId.toString();
    const key = `${mark.studentVentureId.toString()}:${activityKey}`;
    const day = mark.date.toISOString();

    const bucket = cells.get(key) ?? { present: 0, absent: 0, dates: new Set<string>() };
    if (mark.status === 'PRESENT') bucket.present += 1;
    else bucket.absent += 1;
    bucket.dates.add(day);
    cells.set(key, bucket);

    const days = datesByActivity.get(activityKey) ?? new Set<string>();
    days.add(day);
    datesByActivity.set(activityKey, days);
  }

  const rows: ConsolidatedStudentRow[] = ventures
    .map((venture) => {
      const ventureId = venture._id.toString();
      const studentId = venture.studentId?.toString() ?? '';
      const profile = profileByUser.get(studentId);

      const own = activities.map((activity): ConsolidatedCell => {
        const activityId = activity._id.toString();
        const bucket = cells.get(`${ventureId}:${activityId}`);
        const present = bucket?.present ?? 0;
        const absent = bucket?.absent ?? 0;
        const isAssigned = assigned.has(`${ventureId}:${activityId}`);
        const registerDays = datesByActivity.get(activityId)?.size ?? 0;

        return {
          ventureActivityId: activityId,
          assigned: isAssigned,
          records: present + absent,
          present,
          absent,
          // Somebody not on the activity has no gap to answer for.
          unmarked: isAssigned ? Math.max(0, registerDays - (bucket?.dates.size ?? 0)) : 0,
          attendanceRate: rate(present, present + absent),
        };
      });

      const present = own.reduce((sum, cell) => sum + cell.present, 0);
      const absent = own.reduce((sum, cell) => sum + cell.absent, 0);

      return {
        studentVentureId: ventureId,
        studentId,
        studentName: studentById.get(studentId)?.name ?? 'Unknown student',
        rollNumber: profile?.rollNumber ?? '',
        batch: profile?.batch ?? '',
        ventureName: venture.ventureName,
        cells: own,
        records: present + absent,
        present,
        absent,
        unmarked: own.reduce((sum, cell) => sum + cell.unmarked, 0),
        attendanceRate: rate(present, present + absent),
      };
    })
    .sort(
      (a, b) =>
        a.rollNumber.localeCompare(b.rollNumber) || a.studentName.localeCompare(b.studentName),
    );

  const columns: ConsolidatedColumn[] = activities.map((activity) => {
    const activityId = activity._id.toString();
    const present = rows.reduce(
      (sum, row) =>
        sum + (row.cells.find((cell) => cell.ventureActivityId === activityId)?.present ?? 0),
      0,
    );
    const absent = rows.reduce(
      (sum, row) =>
        sum + (row.cells.find((cell) => cell.ventureActivityId === activityId)?.absent ?? 0),
      0,
    );

    return {
      ...describeActivity(activity),
      sessions: datesByActivity.get(activityId)?.size ?? 0,
      records: present + absent,
      present,
      absent,
      attendanceRate: rate(present, present + absent),
    };
  });

  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const absent = rows.reduce((sum, row) => sum + row.absent, 0);

  return {
    columns,
    rows,
    totals: {
      activities: columns.length,
      students: rows.length,
      sessions: columns.reduce((sum, column) => sum + column.sessions, 0),
      records: present + absent,
      present,
      absent,
      unmarked: rows.reduce((sum, row) => sum + row.unmarked, 0),
      attendanceRate: rate(present, present + absent),
    },
  };
}

// -------------------------------------------------------- one student -------

export interface IndividualAttendanceMark {
  date: string;
  status: AttendanceMark;
  remarks: string;
  markedAt: string | null;
  markedByName: string | null;
}

export interface IndividualAttendanceActivity extends AttendanceActivityHeader {
  /** Dates a register was taken for this activity, cohort-wide. */
  sessions: number;
  present: number;
  absent: number;
  unmarked: number;
  attendanceRate: number | null;
  marks: IndividualAttendanceMark[];
}

export interface IndividualAttendance {
  student: {
    studentVentureId: string;
    studentId: string;
    studentName: string;
    rollNumber: string;
    batch: string;
    ventureName: string;
  };
  activities: IndividualAttendanceActivity[];
  totals: {
    activities: number;
    sessions: number;
    records: number;
    present: number;
    absent: number;
    unmarked: number;
    attendanceRate: number | null;
  };
}

/**
 * One student's full attendance record, for the programme office.
 *
 * Lists every activity the student is assigned to, not only the ones they have
 * a mark on: a student missing from three registers is exactly what this report
 * is opened to find, and an activity that quietly disappears because nobody
 * marked them cannot be noticed.
 */
export async function getIndividualAttendance(
  studentVentureId: string,
  filters: ReportFilters = {},
): Promise<IndividualAttendance> {
  await connectToDatabase();

  const venture = await StudentVenture.findById(studentVentureId)
    .select('ventureName studentId')
    .populate<{ studentId: { _id: Types.ObjectId; name: string } | null }>('studentId', 'name')
    .lean()
    .exec();

  if (!venture) throw new NotFoundError('Venture not found');

  const studentId = venture.studentId?._id?.toString() ?? '';

  const assignments = await StudentVentureActivity.find({ studentVentureId })
    .select('ventureActivityId')
    .lean()
    .exec();

  const activityIds = assignments.map((record) => record.ventureActivityId);

  const range = dateWindow(filters);

  const ownQuery: Record<string, unknown> = { studentVentureId };
  if (filters.ventureActivityId) ownQuery.ventureActivityId = filters.ventureActivityId;
  if (filters.attendanceStatus) ownQuery.status = filters.attendanceStatus;
  if (range) ownQuery.date = range;

  const cohortQuery: Record<string, unknown> = { ventureActivityId: { $in: activityIds } };
  if (range) cohortQuery.date = range;

  const [profile, activities, own, cohort] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).select('rollNumber batch').lean().exec(),
    VentureActivity.find({ _id: { $in: activityIds } })
      .select('activityCode name order termId startDate endDate durationDays')
      .populate<{ termId: { name: string } | null }>('termId', 'name')
      .sort({ order: 1 })
      .lean()
      .exec(),
    VentureActivityAttendance.find(ownQuery)
      .populate<{ markedBy: { name: string } | null }>('markedBy', 'name')
      .sort({ date: -1 })
      .lean()
      .exec(),
    // How many dates each activity was taken on at all, which is what this
    // student's marks are missing from when they are missing.
    VentureActivityAttendance.find(cohortQuery).select('ventureActivityId date').lean().exec(),
  ]);

  const byActivity = new Map<string, typeof own>();
  for (const mark of own) {
    const key = mark.ventureActivityId.toString();
    byActivity.set(key, [...(byActivity.get(key) ?? []), mark]);
  }

  const datesByActivity = new Map<string, Set<string>>();
  for (const mark of cohort) {
    const key = mark.ventureActivityId.toString();
    const days = datesByActivity.get(key) ?? new Set<string>();
    days.add(mark.date.toISOString());
    datesByActivity.set(key, days);
  }

  const rows: IndividualAttendanceActivity[] = activities.map((activity) => {
    const key = activity._id.toString();
    const marks = byActivity.get(key) ?? [];
    const present = marks.filter((mark) => mark.status === 'PRESENT').length;
    const absent = marks.length - present;
    const sessions = datesByActivity.get(key)?.size ?? 0;

    return {
      ...describeActivity(activity),
      sessions,
      present,
      absent,
      unmarked: Math.max(0, sessions - marks.length),
      attendanceRate: rate(present, marks.length),
      marks: marks.map((mark) => ({
        date: mark.date.toISOString(),
        status: mark.status,
        remarks: mark.remarks ?? '',
        markedAt: mark.markedAt ? mark.markedAt.toISOString() : null,
        markedByName: mark.markedBy?.name ?? null,
      })),
    };
  });

  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const absent = rows.reduce((sum, row) => sum + row.absent, 0);

  return {
    student: {
      studentVentureId,
      studentId,
      studentName: venture.studentId?.name ?? 'Unknown student',
      rollNumber: profile?.rollNumber ?? '',
      batch: profile?.batch ?? '',
      ventureName: venture.ventureName,
    },
    activities: rows,
    totals: {
      activities: rows.length,
      sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
      records: present + absent,
      present,
      absent,
      unmarked: rows.reduce((sum, row) => sum + row.unmarked, 0),
      attendanceRate: rate(present, present + absent),
    },
  };
}

// -------------------------------------------------------------- options -----

/** Every activity, for the register's activity filter. */
export async function listAttendanceActivities() {
  await connectToDatabase();

  const activities = await VentureActivity.find()
    .select('activityCode name order')
    .sort({ order: 1 })
    .lean()
    .exec();

  return activities.map((activity) => ({
    _id: activity._id.toString(),
    activityCode: activity.activityCode,
    name: activity.name,
  }));
}
