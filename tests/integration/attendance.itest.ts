/**
 * Venture Activity attendance, against a real MongoDB.
 *
 * Two things are load-bearing here and everything else supports them.
 *
 * The first is that attendance must not touch the rules. This codebase has
 * three — sequential progression, the attempt limit and dual review — and a
 * register is exactly the kind of feature that quietly grows into a fourth.
 * Marking a student absent has to leave every one of them behaving identically.
 *
 * The second is that "not marked" and "absent" are different facts. The whole
 * reason this moved out of a column on `StudentVentureActivity` is that a
 * single field could not tell them apart, and every count on every screen
 * inherited the confusion.
 *
 * Requires MONGODB_URI and seeded activities. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, getVentureProgress } =
  await import('@/services/ventures/studentVentureService');
const {
  clearAttendance,
  getAttendanceBoard,
  getAttendanceRoster,
  getConsolidatedAttendance,
  getIndividualAttendance,
  getStudentAttendance,
  listAttendanceDates,
  saveAttendance,
} = await import('@/services/ventures/attendanceService');

const SUFFIX = `att-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

const DAY_ONE = new Date('2026-05-04T00:00:00.000Z');
const DAY_TWO = new Date('2026-05-07T00:00:00.000Z');

let adminId: string;
let studentOneId: string;
let studentTwoId: string;
let ventureOneId: string;
let ventureTwoId: string;
let activityId: string;
let secondActivityId: string;

beforeAll(async () => {
  await connectToDatabase();

  if ((await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec()) < 2) {
    throw new Error('Run `npm run seed` before the integration tests.');
  }

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('Run `npm run seed` before the integration tests.');
  adminId = admin._id.toString();

  studentOneId = (
    await createUser({
      role: 'STUDENT',
      name: 'Attendance One',
      email: email('one'),
      status: 'ACTIVE',
      profile: { rollNumber: `ATT1-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  studentTwoId = (
    await createUser({
      role: 'STUDENT',
      name: 'Attendance Two',
      email: email('two'),
      status: 'ACTIVE',
      profile: { rollNumber: `ATT2-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  ventureOneId = (
    await createStudentVenture({
      studentId: studentOneId,
      ventureName: `Attendance Venture One ${SUFFIX}`,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  ventureTwoId = (
    await createStudentVenture({
      studentId: studentTwoId,
      ventureName: `Attendance Venture Two ${SUFFIX}`,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  const progress = await getVentureProgress(ventureOneId);
  activityId = progress[0]!.activity._id.toString();
  secondActivityId = progress[1]!.activity._id.toString();
});

afterAll(async () => {
  const ventureIds = [ventureOneId, ventureTwoId].filter(Boolean);
  const userIds = [studentOneId, studentTwoId].filter(Boolean);

  await models.VentureActivityAttendance.deleteMany({
    studentVentureId: { $in: ventureIds },
  }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

/** This spec's own two ventures, ignoring whatever the seed left behind. */
function mine<T extends { studentVentureId: string }>(rows: T[]): T[] {
  return rows.filter((row) => [ventureOneId, ventureTwoId].includes(row.studentVentureId));
}

describe('the model', () => {
  it('creates no attendance row until somebody marks one', async () => {
    // The point of the whole redesign: unmarked is the absence of a record,
    // not a status meaning "nobody has decided".
    const count = await models.VentureActivityAttendance.countDocuments({
      studentVentureId: ventureOneId,
    }).exec();

    expect(count).toBe(0);
  });

  it('refuses a status outside Present and Absent', async () => {
    await expect(
      models.VentureActivityAttendance.create({
        ventureActivityId: activityId,
        studentVentureId: ventureOneId,
        date: DAY_ONE,
        // Cast past the enum: the point is that the *database* refuses it,
        // not that TypeScript does.
        status: 'EXCUSED' as 'PRESENT',
        markedBy: adminId,
      }),
    ).rejects.toThrow();
  });

  it('refuses a row with nobody accountable for it', async () => {
    // `markedBy` is the answer to "who said so", which is the question a
    // disputed absence asks. A row without it is worse than no row.
    await expect(
      models.VentureActivityAttendance.create({
        ventureActivityId: activityId,
        studentVentureId: ventureOneId,
        date: DAY_ONE,
        status: 'PRESENT',
      }),
    ).rejects.toThrow(/markedBy/i);
  });

  it('stores the date at midnight UTC, whatever time it was given', async () => {
    // Two registers taken on the same day at different hours must be the same
    // date to the unique index, or the second silently duplicates the first.
    await saveAttendance({
      ventureActivityId: activityId,
      date: new Date('2026-05-04T16:45:00.000Z'),
      entries: [{ studentVentureId: ventureOneId, status: 'PRESENT' }],
      markedBy: adminId,
    });

    const row = await models.VentureActivityAttendance.findOne({
      ventureActivityId: activityId,
      studentVentureId: ventureOneId,
    })
      .lean()
      .exec();

    expect(row!.date.toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });

  it('treats a second save for the same date as an edit, not a duplicate', async () => {
    await saveAttendance({
      ventureActivityId: activityId,
      date: DAY_ONE,
      entries: [{ studentVentureId: ventureOneId, status: 'ABSENT', remarks: 'Away' }],
      markedBy: adminId,
    });

    const rows = await models.VentureActivityAttendance.find({
      ventureActivityId: activityId,
      studentVentureId: ventureOneId,
      date: DAY_ONE,
    })
      .lean()
      .exec();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('ABSENT');
    expect(rows[0]!.remarks).toBe('Away');
  });

  it('clears a remark that an edit removed', async () => {
    await saveAttendance({
      ventureActivityId: activityId,
      date: DAY_ONE,
      entries: [{ studentVentureId: ventureOneId, status: 'PRESENT' }],
      markedBy: adminId,
    });

    const row = await models.VentureActivityAttendance.findOne({
      ventureActivityId: activityId,
      studentVentureId: ventureOneId,
      date: DAY_ONE,
    })
      .lean()
      .exec();

    expect(row!.status).toBe('PRESENT');
    expect(row!.remarks).toBeUndefined();
  });
});

describe('several dates on one activity', () => {
  it('records a second date without disturbing the first', async () => {
    // The thing the old single-field design could not represent at all.
    await saveAttendance({
      ventureActivityId: activityId,
      date: DAY_TWO,
      entries: [
        { studentVentureId: ventureOneId, status: 'ABSENT' },
        { studentVentureId: ventureTwoId, status: 'PRESENT' },
      ],
      markedBy: adminId,
    });

    const dates = await listAttendanceDates(activityId);
    const own = dates.filter((entry) =>
      [DAY_ONE.toISOString(), DAY_TWO.toISOString()].includes(entry.date),
    );

    expect(own).toHaveLength(2);
    // Newest first — history is read backwards.
    expect(own[0]!.date).toBe(DAY_TWO.toISOString());
  });

  it('keeps the marks for each date separate', async () => {
    const dayOne = await getAttendanceRoster(activityId, DAY_ONE);
    const dayTwo = await getAttendanceRoster(activityId, DAY_TWO);

    const onDayOne = mine(dayOne.rows).find((row) => row.studentVentureId === ventureOneId);
    const onDayTwo = mine(dayTwo.rows).find((row) => row.studentVentureId === ventureOneId);

    expect(onDayOne!.status).toBe('PRESENT');
    expect(onDayTwo!.status).toBe('ABSENT');
  });
});

describe('the roster', () => {
  it('lists everyone assigned to the activity, marked or not', async () => {
    // Built from the assignments, not from the attendance rows: building it
    // the other way round drops exactly the people who still need marking.
    const roster = await getAttendanceRoster(secondActivityId, DAY_ONE);
    const own = mine(roster.rows);

    expect(own).toHaveLength(2);
    expect(own.every((row) => row.status === null)).toBe(true);
    expect(own.map((row) => row.studentName).sort()).toEqual(['Attendance One', 'Attendance Two']);
  });

  it('carries the roll number and venture for each student', async () => {
    const roster = await getAttendanceRoster(activityId, DAY_ONE);
    const row = mine(roster.rows).find((entry) => entry.studentVentureId === ventureOneId)!;

    // Stored uppercased by the profile schema, so compared that way.
    expect(row.rollNumber).toBe(`ATT1-${SUFFIX}`.toUpperCase());
    expect(row.ventureName).toContain(SUFFIX);
  });

  it('says who marked each row and when', async () => {
    const roster = await getAttendanceRoster(activityId, DAY_ONE);
    const row = mine(roster.rows).find((entry) => entry.studentVentureId === ventureOneId)!;

    expect(row.markedByName).toBeTruthy();
    expect(row.markedAt).toBeTruthy();
  });

  it('refuses an activity that is not there', async () => {
    await expect(getAttendanceRoster('000000000000000000000000', DAY_ONE)).rejects.toThrow(
      /not found/i,
    );
  });

  it('refuses to mark somebody who is not on the activity', async () => {
    // Without this a crafted post could file attendance against a venture that
    // is not on the register, and nothing downstream would notice.
    //
    // Checked with an id that belongs to no venture at all. An earlier version
    // of this test deleted a real venture's assignment to manufacture the
    // condition, which damaged seeded data — a test must never make the
    // database worse to prove a point.
    await expect(
      saveAttendance({
        ventureActivityId: activityId,
        date: DAY_ONE,
        entries: [{ studentVentureId: '000000000000000000000000', status: 'PRESENT' }],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('refuses the whole register if any one student is not on the activity', async () => {
    // All or nothing: a partially applied register is worse than a rejected
    // one, because nothing on screen says which half landed.
    await expect(
      saveAttendance({
        ventureActivityId: activityId,
        date: DAY_ONE,
        entries: [
          { studentVentureId: ventureOneId, status: 'PRESENT' },
          { studentVentureId: '000000000000000000000000', status: 'PRESENT' },
        ],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/not assigned/i);
  });
});

describe('clearing a mark', () => {
  it('removes the row rather than storing a third status', async () => {
    await saveAttendance({
      ventureActivityId: secondActivityId,
      date: DAY_ONE,
      entries: [{ studentVentureId: ventureTwoId, status: 'PRESENT' }],
      markedBy: adminId,
    });

    const cleared = await clearAttendance({
      ventureActivityId: secondActivityId,
      studentVentureId: ventureTwoId,
      date: DAY_ONE,
    });

    expect(cleared.cleared).toBe(1);

    const roster = await getAttendanceRoster(secondActivityId, DAY_ONE);
    const row = mine(roster.rows).find((entry) => entry.studentVentureId === ventureTwoId)!;
    expect(row.status).toBeNull();
  });

  it('clears within the same save that marks everyone else', async () => {
    // What the dialog's "click again to clear" actually submits. Omitting the
    // student instead would read as "unchanged" on the server, so the mark
    // would survive a save that said on screen it had been taken off.
    await saveAttendance({
      ventureActivityId: secondActivityId,
      date: DAY_TWO,
      entries: [
        { studentVentureId: ventureOneId, status: 'PRESENT' },
        { studentVentureId: ventureTwoId, status: 'ABSENT' },
      ],
      markedBy: adminId,
    });

    const result = await saveAttendance({
      ventureActivityId: secondActivityId,
      date: DAY_TWO,
      entries: [{ studentVentureId: ventureTwoId, status: 'PRESENT' }],
      cleared: [ventureOneId],
      markedBy: adminId,
    });

    expect(result.cleared).toBe(1);

    const roster = await getAttendanceRoster(secondActivityId, DAY_TWO);
    const one = mine(roster.rows).find((row) => row.studentVentureId === ventureOneId)!;
    const two = mine(roster.rows).find((row) => row.studentVentureId === ventureTwoId)!;

    expect(one.status).toBeNull();
    expect(two.status).toBe('PRESENT');
  });

  it('leaves that student’s other dates alone', async () => {
    const other = await getAttendanceRoster(secondActivityId, DAY_ONE);
    expect(
      mine(other.rows).find((row) => row.studentVentureId === ventureOneId)!.status,
    ).toBeNull();

    // DAY_TWO was cleared above; DAY_ONE on the first activity is untouched.
    const first = await getAttendanceRoster(activityId, DAY_ONE);
    expect(mine(first.rows).find((row) => row.studentVentureId === ventureOneId)!.status).toBe(
      'PRESENT',
    );
  });

  it('keeps the mark when a student is both marked and cleared', async () => {
    // A contradictory submit resolves to the more specific instruction rather
    // than to whichever write happened to run last.
    await saveAttendance({
      ventureActivityId: secondActivityId,
      date: DAY_TWO,
      entries: [{ studentVentureId: ventureOneId, status: 'ABSENT' }],
      cleared: [ventureOneId],
      markedBy: adminId,
    });

    const roster = await getAttendanceRoster(secondActivityId, DAY_TWO);
    expect(mine(roster.rows).find((row) => row.studentVentureId === ventureOneId)!.status).toBe(
      'ABSENT',
    );
  });

  it('applies nothing at all if the register names somebody not on the activity', async () => {
    // The clear must not land before the marks are found to be invalid: half a
    // register applied is worse than none, because nothing says which half.
    await expect(
      saveAttendance({
        ventureActivityId: secondActivityId,
        date: DAY_TWO,
        entries: [{ studentVentureId: '000000000000000000000000', status: 'PRESENT' }],
        cleared: [ventureTwoId],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/not assigned/i);

    const roster = await getAttendanceRoster(secondActivityId, DAY_TWO);
    expect(mine(roster.rows).find((row) => row.studentVentureId === ventureTwoId)!.status).toBe(
      'PRESENT',
    );
  });
});

describe('the summary', () => {
  it('counts records and dates per activity', async () => {
    const board = await getAttendanceBoard({ ventureActivityId: activityId });
    const row = board.rows[0]!;

    expect(row._id).toBe(activityId);
    expect(row.sessions).toBeGreaterThanOrEqual(2);
    expect(row.records).toBe(row.present + row.absent);
  });

  it('measures attendance against the marks that exist, not the cohort', async () => {
    // A register nobody has taken is not 0% attendance. Reporting it as 0%
    // invents a problem nobody has, which is what the old design did.
    const board = await getAttendanceBoard({ studentVentureId: ventureOneId });

    const untouched = board.rows.find((row) => row.records === 0);
    expect(untouched).toBeDefined();
    expect(untouched!.attendanceRate).toBeNull();

    const marked = board.rows.find((row) => row._id === activityId)!;
    expect(marked.attendanceRate).toBe(Math.round((marked.present / marked.records) * 100));
  });

  it('counts assigned students separately from marks', async () => {
    const board = await getAttendanceBoard({ ventureActivityId: activityId });
    const row = board.rows[0]!;

    // Students is the size of a full register; records is how much of it has
    // actually been filled in. Conflating them is what hid unmarked people.
    expect(row.students).toBeGreaterThan(0);
    expect(row.students).not.toBe(row.records);
  });

  it('filters by date range', async () => {
    // Scoped to this spec's own venture: the seed writes registers against the
    // same activity, and a date window alone would count those too.
    const before = await getAttendanceBoard({
      ventureActivityId: activityId,
      studentVentureId: ventureOneId,
      dateTo: new Date('2026-05-05T00:00:00.000Z'),
    });
    const after = await getAttendanceBoard({
      ventureActivityId: activityId,
      studentVentureId: ventureOneId,
      dateFrom: new Date('2026-05-06T00:00:00.000Z'),
    });

    expect(before.rows[0]!.sessions).toBe(1);
    expect(before.rows[0]!.records).toBe(1);
    expect(after.rows[0]!.sessions).toBe(1);
    expect(after.rows[0]!.records).toBe(1);
  });

  it('filters by status without corrupting the counts it reports', async () => {
    const absent = await getAttendanceBoard({
      ventureActivityId: activityId,
      attendanceStatus: 'ABSENT',
    });

    expect(absent.rows[0]!.present).toBe(0);
    expect(absent.rows[0]!.absent).toBeGreaterThan(0);
    // Students on the activity is a fact about the activity, not about the
    // filter, so it must survive one.
    expect(absent.rows[0]!.students).toBeGreaterThan(0);
  });

  it('lists every activity, including ones with no register', async () => {
    const board = await getAttendanceBoard({});
    expect(board.rows.length).toBe(board.activityCount);
  });
});

describe('what a student sees', () => {
  it('groups their own marks by activity, newest date first', async () => {
    const own = await getStudentAttendance(ventureOneId);
    const activity = own.activities.find((row) => row.ventureActivityId === activityId)!;

    expect(activity.sessions).toBe(2);
    expect(activity.marks[0]!.date).toBe(DAY_TWO.toISOString());
    expect(activity.present + activity.absent).toBe(activity.sessions);
  });

  it('omits activities they have never been marked on', async () => {
    // Twelve rows saying "no sessions" would bury the one that carries
    // information.
    const own = await getStudentAttendance(ventureOneId);
    expect(own.activities.length).toBeLessThan(12);
  });

  it('totals across every activity', async () => {
    const own = await getStudentAttendance(ventureOneId);
    const summed = own.activities.reduce((total, row) => total + row.sessions, 0);

    expect(own.totals.sessions).toBe(summed);
    expect(own.totals.attendanceRate).toBe(
      Math.round((own.totals.present / own.totals.sessions) * 100),
    );
  });

  it('refuses a venture that is not there', async () => {
    await expect(getStudentAttendance('000000000000000000000000')).rejects.toThrow(/not found/i);
  });
});

describe('attendance changes no rule', () => {
  it('leaves progression, attempts and review state untouched when marked absent', async () => {
    const before = await getVentureProgress(ventureOneId);

    await saveAttendance({
      ventureActivityId: activityId,
      date: DAY_ONE,
      entries: [{ studentVentureId: ventureOneId, status: 'ABSENT' }],
      markedBy: adminId,
    });

    const after = await getVentureProgress(ventureOneId);

    // Compare the whole derived read model, field by field. If the register
    // ever starts gating something, this fails.
    expect(after).toHaveLength(before.length);
    after.forEach((row, index) => {
      const previous = before[index]!;
      expect(row.uiState).toBe(previous.uiState);
      expect(row.unlocked).toBe(previous.unlocked);
      expect(row.record.status).toBe(previous.record.status);
      expect(row.record.attemptNumber).toBe(previous.record.attemptNumber);
      expect(row.record.facultyReviewStatus).toBe(previous.record.facultyReviewStatus);
      expect(row.record.mentorReviewStatus).toBe(previous.record.mentorReviewStatus);
      expect(row.attempt.canSubmit).toBe(previous.attempt.canSubmit);
      expect(row.attempt.attemptsRemaining).toBe(previous.attempt.attemptsRemaining);
      expect(row.reviewSummary).toBe(previous.reviewSummary);
    });
  });

  it('still allows a submission from a student marked absent', async () => {
    const progress = await getVentureProgress(ventureOneId);
    expect(progress[0]!.attempt.canSubmit).toBe(true);
  });

  it('does not touch the progress record at all', async () => {
    // The register lives in its own collection, so `updatedAt` — which the
    // admin review queue reads as "waiting since" — cannot move when somebody
    // takes attendance.
    const record = await models.StudentVentureActivity.findOne({
      studentVentureId: ventureOneId,
      ventureActivityId: activityId,
    })
      .select('updatedAt')
      .lean()
      .exec();

    const before = record!.updatedAt.getTime();

    await saveAttendance({
      ventureActivityId: activityId,
      date: DAY_TWO,
      entries: [{ studentVentureId: ventureOneId, status: 'PRESENT' }],
      markedBy: adminId,
    });

    const after = await models.StudentVentureActivity.findOne({
      studentVentureId: ventureOneId,
      ventureActivityId: activityId,
    })
      .select('updatedAt')
      .lean()
      .exec();

    expect(after!.updatedAt.getTime()).toBe(before);
  });
});

describe('the consolidated report', () => {
  it('gives every assigned student a row, marked or not', async () => {
    // Built from the assignments, like the roster. Building it from the marks
    // would drop exactly the students the report is opened to find.
    const consolidated = await getConsolidatedAttendance({ ventureActivityId: activityId });

    const own = consolidated.rows.filter((row) =>
      [ventureOneId, ventureTwoId].includes(row.studentVentureId),
    );

    expect(own).toHaveLength(2);
    expect(consolidated.columns).toHaveLength(1);
    expect(consolidated.columns[0]!._id).toBe(activityId);
  });

  it('lines each row up with the columns', async () => {
    // The grid renders cells positionally; a row shorter than the header would
    // silently shift every student's marks one activity to the left.
    const consolidated = await getConsolidatedAttendance({});

    for (const row of consolidated.rows) {
      expect(row.cells).toHaveLength(consolidated.columns.length);
      expect(row.cells.map((cell) => cell.ventureActivityId)).toEqual(
        consolidated.columns.map((column) => column._id),
      );
    }
  });

  it('counts a register date nobody marked the student on as a gap, not an absence', async () => {
    // The distinction the whole redesign exists for, in the view most likely
    // to be read as a verdict on a student.
    const DAY_THREE = new Date('2026-05-11T00:00:00.000Z');

    // A register taken with only one of the two students on it.
    await saveAttendance({
      ventureActivityId: secondActivityId,
      date: DAY_THREE,
      entries: [{ studentVentureId: ventureTwoId, status: 'PRESENT' }],
      markedBy: adminId,
    });

    // Windowed to that one date, so this asserts about that register rather
    // than about whatever earlier specs left on the other dates.
    const consolidated = await getConsolidatedAttendance({
      ventureActivityId: secondActivityId,
      dateFrom: DAY_THREE,
      dateTo: DAY_THREE,
    });

    const cell = consolidated.rows.find((row) => row.studentVentureId === ventureOneId)!.cells[0]!;

    expect(cell.records).toBe(0);
    expect(cell.absent).toBe(0);
    expect(cell.unmarked).toBe(1);
    // Never marked is not nought per cent.
    expect(cell.attendanceRate).toBeNull();
  });

  it('measures every rate against the marks that exist', async () => {
    const consolidated = await getConsolidatedAttendance({});

    for (const row of consolidated.rows) {
      if (row.records === 0) expect(row.attendanceRate).toBeNull();
      else expect(row.attendanceRate).toBe(Math.round((row.present / row.records) * 100));
    }
  });

  it('ignores a status filter rather than reporting half a grid', async () => {
    // A grid of present and absent counts narrowed to one of them would print
    // zero in the other column and read as a finding.
    const all = await getConsolidatedAttendance({});
    const filtered = await getConsolidatedAttendance({ attendanceStatus: 'PRESENT' });

    expect(filtered.totals.absent).toBe(all.totals.absent);
    expect(filtered.totals.records).toBe(all.totals.records);
  });
});

describe('the individual report', () => {
  it('lists every assigned activity, including the unmarked ones', async () => {
    const report = await getIndividualAttendance(ventureOneId);

    const assigned = await models.StudentVentureActivity.countDocuments({
      studentVentureId: ventureOneId,
    }).exec();

    expect(report.activities).toHaveLength(assigned);
    expect(report.activities.some((activity) => activity.marks.length === 0)).toBe(true);
  });

  it('carries who marked each row and when', async () => {
    // The question a disputed absence asks. A report that cannot answer it is
    // no better than the boolean this replaced.
    const report = await getIndividualAttendance(ventureOneId);
    const marked = report.activities.find((activity) => activity.marks.length > 0)!;

    expect(marked.marks[0]!.markedByName).toBeTruthy();
    expect(marked.marks[0]!.markedAt).toBeTruthy();
  });

  it('identifies the student it is about', async () => {
    const report = await getIndividualAttendance(ventureOneId);

    expect(report.student.studentName).toBe('Attendance One');
    expect(report.student.rollNumber).toBe(`ATT1-${SUFFIX}`.toUpperCase());
  });

  it('narrows to one activity without disturbing that activity’s own totals', async () => {
    const all = await getIndividualAttendance(ventureOneId);
    const one = await getIndividualAttendance(ventureOneId, { ventureActivityId: activityId });

    const fromAll = all.activities.find((activity) => activity._id === activityId)!;
    const fromOne = one.activities.find((activity) => activity._id === activityId)!;

    expect(fromOne.present).toBe(fromAll.present);
    expect(fromOne.absent).toBe(fromAll.absent);
  });

  it('refuses a venture that is not there', async () => {
    await expect(getIndividualAttendance('000000000000000000000000')).rejects.toThrow(/not found/i);
  });
});
