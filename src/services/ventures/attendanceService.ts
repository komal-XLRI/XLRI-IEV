import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentVenture, StudentVentureActivity, VentureActivity } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { containsPattern } from '@/lib/utils/regex';
import {
  VENTURE_ATTENDANCE_STATUSES,
  type VentureAttendanceStatus,
} from '@/lib/constants/status';
import type { StudentActivityStatus } from '@/lib/constants/status';

/**
 * Attendance on Venture Activities.
 *
 * Kept apart from `studentVentureService`, which owns the rules that decide
 * what a student may do next. Nothing here participates in those rules:
 * attendance is a record the programme office keeps, and marking a student
 * absent does not lock an activity, consume an attempt or fail a review. That
 * separation is the point — a future reader looking for what gates progression
 * should not find this file in the way.
 *
 * The roster is per Venture Activity rather than per venture, because that is
 * the shape of the question being asked: "who turned up for V03".
 */

export interface AttendanceRosterRow {
  recordId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  attendanceStatus: VentureAttendanceStatus;
  /** Shown beside attendance so a marker can see who was working on it. */
  activityStatus: StudentActivityStatus;
}

export interface AttendanceRoster {
  activity: { _id: string; activityCode: string; name: string };
  rows: AttendanceRosterRow[];
  counts: Record<VentureAttendanceStatus, number>;
}

/** Every student's attendance for one Venture Activity, with a search. */
export async function getAttendanceRoster(
  ventureActivityId: string,
  filters: { q?: string; attendanceStatus?: VentureAttendanceStatus } = {},
): Promise<AttendanceRoster> {
  await connectToDatabase();

  const activity = await VentureActivity.findById(ventureActivityId)
    .select('activityCode name')
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const query: Record<string, unknown> = { ventureActivityId };
  if (filters.attendanceStatus) query.attendanceStatus = filters.attendanceStatus;

  const records = await StudentVentureActivity.find(query)
    .select('studentVentureId attendanceStatus status')
    .populate<{
      studentVentureId: {
        ventureName: string;
        studentId: { _id: unknown; name: string; email: string } | null;
      } | null;
    }>({
      path: 'studentVentureId',
      select: 'ventureName studentId',
      populate: { path: 'studentId', select: 'name email' },
    })
    .lean()
    .exec();

  const all: AttendanceRosterRow[] = records.map((record) => ({
    recordId: record._id.toString(),
    studentId: record.studentVentureId?.studentId?._id
      ? String(record.studentVentureId.studentId._id)
      : '',
    studentName: record.studentVentureId?.studentId?.name ?? 'Unknown student',
    studentEmail: record.studentVentureId?.studentId?.email ?? '',
    ventureName: record.studentVentureId?.ventureName ?? '—',
    attendanceStatus: record.attendanceStatus,
    activityStatus: record.status,
  }));

  // Counted before the text search, so the summary describes the cohort rather
  // than whatever the marker has currently typed into the box.
  const counts = VENTURE_ATTENDANCE_STATUSES.reduce(
    (running, status) => ({
      ...running,
      [status]: all.filter((row) => row.attendanceStatus === status).length,
    }),
    {} as Record<VentureAttendanceStatus, number>,
  );

  const pattern = filters.q ? containsPattern(filters.q) : null;
  const rows = (
    pattern
      ? all.filter(
          (row) =>
            pattern.test(row.studentName) ||
            pattern.test(row.studentEmail) ||
            pattern.test(row.ventureName),
        )
      : all
  ).sort((a, b) => a.studentName.localeCompare(b.studentName));

  return {
    activity: {
      _id: activity._id.toString(),
      activityCode: activity.activityCode,
      name: activity.name,
    },
    rows,
    counts,
  };
}

/**
 * Marks attendance for one or more students on a Venture Activity.
 *
 * Written as a bulk operation because that is how attendance is actually taken
 * — down a list, in one sitting. A single-row call is just a list of one, which
 * keeps one code path rather than two that can drift.
 */
export async function markVentureAttendance(
  entries: Array<{ recordId: string; attendanceStatus: VentureAttendanceStatus }>,
): Promise<{ updated: number }> {
  await connectToDatabase();

  if (entries.length === 0) return { updated: 0 };

  const ids = entries.map((entry) => entry.recordId);
  const found = await StudentVentureActivity.find({ _id: { $in: ids } })
    .select('_id attendanceStatus')
    .lean()
    .exec();

  // All or nothing: a partially applied roster leaves the register half marked
  // with nothing on screen saying which half.
  if (found.length !== new Set(ids).size) {
    throw new NotFoundError('One or more activity records no longer exist');
  }

  const current = new Map(found.map((record) => [record._id.toString(), record.attendanceStatus]));
  const changes = entries.filter(
    (entry) => current.get(entry.recordId) !== entry.attendanceStatus,
  );

  if (changes.length === 0) return { updated: 0 };

  // One round trip rather than one per student: a full cohort marked row by row
  // is a request per student against a remote database.
  //
  // `timestamps: false` is not an optimisation. `updatedAt` on this record is
  // read as "waiting since" by the admin review queue, so letting attendance
  // touch it would reorder that queue and reset every reviewer's clock.
  const result = await StudentVentureActivity.bulkWrite(
    changes.map((entry) => ({
      updateOne: {
        filter: { _id: entry.recordId },
        update: { $set: { attendanceStatus: entry.attendanceStatus } },
      },
    })),
    { timestamps: false },
  );

  return { updated: result.modifiedCount ?? 0 };
}

/**
 * Sets the same status for every student on an activity.
 *
 * "Everyone turned up" is the common case, and clicking it forty times is how
 * attendance stops being recorded at all. Scoped to the records that are not
 * already on that status so the write stays proportional.
 */
export async function markAllVentureAttendance(
  ventureActivityId: string,
  attendanceStatus: VentureAttendanceStatus,
): Promise<{ updated: number }> {
  await connectToDatabase();

  if (!VENTURE_ATTENDANCE_STATUSES.includes(attendanceStatus)) {
    throw new ValidationError('Unknown attendance status');
  }

  const activity = await VentureActivity.findById(ventureActivityId).select('_id').lean().exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const result = await StudentVentureActivity.updateMany(
    { ventureActivityId, attendanceStatus: { $ne: attendanceStatus } },
    { $set: { attendanceStatus } },
    // As above: `updatedAt` is the review queue's "waiting since".
    { timestamps: false },
  ).exec();

  return { updated: result.modifiedCount ?? 0 };
}

export interface AttendanceSummaryRow {
  ventureActivityId: string;
  activityCode: string;
  name: string;
  order: number;
  pending: number;
  present: number;
  absent: number;
  total: number;
}

/** Attendance across every activity, for the list page and for reporting. */
export async function getAttendanceSummary(): Promise<AttendanceSummaryRow[]> {
  await connectToDatabase();

  const [activities, grouped] = await Promise.all([
    VentureActivity.find().select('activityCode name order').sort({ order: 1 }).lean().exec(),
    StudentVentureActivity.aggregate<{
      _id: { ventureActivityId: unknown; attendanceStatus: VentureAttendanceStatus };
      count: number;
    }>([
      {
        $group: {
          _id: {
            ventureActivityId: '$ventureActivityId',
            attendanceStatus: '$attendanceStatus',
          },
          count: { $sum: 1 },
        },
      },
    ]).exec(),
  ]);

  const counts = new Map<string, Map<VentureAttendanceStatus, number>>();
  for (const row of grouped) {
    const key = String(row._id.ventureActivityId);
    const bucket = counts.get(key) ?? new Map<VentureAttendanceStatus, number>();
    bucket.set(row._id.attendanceStatus, row.count);
    counts.set(key, bucket);
  }

  return activities.map((activity) => {
    const bucket = counts.get(activity._id.toString()) ?? new Map();
    const get = (status: VentureAttendanceStatus) => bucket.get(status) ?? 0;

    return {
      ventureActivityId: activity._id.toString(),
      activityCode: activity.activityCode,
      name: activity.name,
      order: activity.order,
      pending: get('PENDING'),
      present: get('PRESENT'),
      absent: get('ABSENT'),
      total: get('PENDING') + get('PRESENT') + get('ABSENT'),
    };
  });
}

/** Attendance for one student across every activity, for their timeline. */
export async function getStudentAttendance(studentVentureId: string) {
  await connectToDatabase();

  const venture = await StudentVenture.findById(studentVentureId).select('_id').lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  const records = await StudentVentureActivity.find({ studentVentureId })
    .select('ventureActivityId attendanceStatus')
    .lean()
    .exec();

  return new Map(
    records.map((record) => [record.ventureActivityId.toString(), record.attendanceStatus]),
  );
}
