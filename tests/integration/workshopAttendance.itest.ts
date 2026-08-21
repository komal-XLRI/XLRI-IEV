/**
 * Workshop attendance, against a real MongoDB.
 *
 * What is being pinned here is the shape, not just the plumbing. A workshop is
 * a single occasion, so its register is keyed on `(workshop, student)` with no
 * date; and it is keyed on the *student*, so a student with no venture is still
 * on it. Both of those are easy to "fix" later into the venture register's
 * shape, and both would be wrong.
 *
 * Every fixture is created here and removed in `afterAll`. No test touches a
 * seeded workshop or a seeded student.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const {
  getStudentWorkshopAttendance,
  getWorkshopAttendanceBoard,
  getWorkshopRoster,
  matchWorkshopAttendees,
  saveWorkshopAttendance,
} = await import('@/services/workshops/workshopAttendanceService');

const SUFFIX = `wsa-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let adminId: string;
let studentOne: string;
let studentTwo: string;
let publishedId: string;
let draftId: string;

async function makeWorkshop(title: string, status: 'PUBLISHED' | 'DRAFT' | 'CANCELLED') {
  const workshop = await models.Workshop.create({
    title: `${title} ${SUFFIX}`,
    workshopType: 'FOUNDER_TALK',
    date: new Date('2026-06-10T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '12:00',
    mode: 'ONLINE',
    meetingLink: 'https://example.test/meet',
    hostName: 'Host',
    speakerName: 'Speaker',
    status,
  });

  return workshop._id.toString();
}

beforeAll(async () => {
  await connectToDatabase();

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('Run `npm run seed` before the integration tests.');
  adminId = admin._id.toString();

  studentOne = (
    await createUser({
      role: 'STUDENT',
      name: 'Workshop One',
      email: email('one'),
      status: 'ACTIVE',
      profile: { rollNumber: `WSA1-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  studentTwo = (
    await createUser({
      role: 'STUDENT',
      name: 'Workshop Two',
      email: email('two'),
      status: 'ACTIVE',
      profile: { rollNumber: `WSA2-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  publishedId = await makeWorkshop('Published Talk', 'PUBLISHED');
  draftId = await makeWorkshop('Draft Talk', 'DRAFT');
});

afterAll(async () => {
  const workshopIds = [publishedId, draftId].filter(Boolean);
  const userIds = [studentOne, studentTwo].filter(Boolean);

  await models.WorkshopAttendance.deleteMany({
    $or: [{ workshopId: { $in: workshopIds } }, { studentId: { $in: userIds } }],
  }).exec();
  await models.Workshop.deleteMany({ _id: { $in: workshopIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

/** This spec's own two students, ignoring whoever else the seed created. */
function mine<T extends { studentId: string }>(rows: T[]): T[] {
  return rows.filter((row) => [studentOne, studentTwo].includes(row.studentId));
}

describe('the shape of the record', () => {
  it('creates no row until somebody marks one', async () => {
    const count = await models.WorkshopAttendance.countDocuments({
      workshopId: publishedId,
    }).exec();

    expect(count).toBe(0);
  });

  it('refuses a status outside Present and Absent', async () => {
    await expect(
      models.WorkshopAttendance.create({
        workshopId: publishedId,
        studentId: studentOne,
        // Cast past the enum: the point is that the *database* refuses it.
        status: 'LATE' as 'PRESENT',
        markedBy: adminId,
      }),
    ).rejects.toThrow();
  });

  it('refuses a row with nobody accountable for it', async () => {
    await expect(
      models.WorkshopAttendance.create({
        workshopId: publishedId,
        studentId: studentOne,
        status: 'PRESENT',
      }),
    ).rejects.toThrow(/markedBy/i);
  });

  it('keys on the student, so a student with no venture is still on the register', async () => {
    // The reason this is not keyed on studentVentureId like the Venture
    // Activity register: a workshop is attended by a person.
    const venture = await models.StudentVenture.findOne({ studentId: studentOne })
      .select('_id')
      .lean()
      .exec();

    expect(venture).toBeNull();

    const roster = await getWorkshopRoster(publishedId);
    expect(
      mine(roster.rows)
        .map((row) => row.studentId)
        .sort(),
    ).toEqual([studentOne, studentTwo].sort());
  });
});

describe('taking the register', () => {
  it('marks a workshop without needing a date', async () => {
    const result = await saveWorkshopAttendance({
      workshopId: publishedId,
      entries: [
        { studentId: studentOne, status: 'PRESENT' },
        { studentId: studentTwo, status: 'ABSENT', remarks: 'Told us in advance' },
      ],
      markedBy: adminId,
    });

    expect(result.marked).toBe(2);

    const roster = await getWorkshopRoster(publishedId);
    const one = mine(roster.rows).find((row) => row.studentId === studentOne)!;
    const two = mine(roster.rows).find((row) => row.studentId === studentTwo)!;

    expect(one.status).toBe('PRESENT');
    expect(two.status).toBe('ABSENT');
    expect(two.remarks).toBe('Told us in advance');
    expect(one.markedByName).toBeTruthy();
    expect(one.markedAt).toBeTruthy();
  });

  it('treats a second save as an edit, not a duplicate', async () => {
    // The unique index doing the work: there is one register per workshop, and
    // re-opening it corrects rather than doubles it.
    await saveWorkshopAttendance({
      workshopId: publishedId,
      entries: [{ studentId: studentOne, status: 'ABSENT' }],
      markedBy: adminId,
    });

    const rows = await models.WorkshopAttendance.find({
      workshopId: publishedId,
      studentId: studentOne,
    })
      .lean()
      .exec();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('ABSENT');
  });

  it('clears a mark within the same save that marks everyone else', async () => {
    const result = await saveWorkshopAttendance({
      workshopId: publishedId,
      entries: [{ studentId: studentTwo, status: 'PRESENT' }],
      cleared: [studentOne],
      markedBy: adminId,
    });

    expect(result.cleared).toBe(1);

    const roster = await getWorkshopRoster(publishedId);
    expect(mine(roster.rows).find((row) => row.studentId === studentOne)!.status).toBeNull();
    expect(mine(roster.rows).find((row) => row.studentId === studentTwo)!.status).toBe('PRESENT');
  });

  it('refuses a draft workshop, which nobody was ever told about', async () => {
    await expect(
      saveWorkshopAttendance({
        workshopId: draftId,
        entries: [{ studentId: studentOne, status: 'PRESENT' }],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/draft/i);

    expect(await models.WorkshopAttendance.countDocuments({ workshopId: draftId }).exec()).toBe(0);
  });

  it('refuses a workshop that is not there', async () => {
    await expect(
      saveWorkshopAttendance({
        workshopId: '000000000000000000000000',
        entries: [{ studentId: studentOne, status: 'PRESENT' }],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('refuses to mark somebody who is not a student', async () => {
    await expect(
      saveWorkshopAttendance({
        workshopId: publishedId,
        entries: [{ studentId: adminId, status: 'PRESENT' }],
        markedBy: adminId,
      }),
    ).rejects.toThrow(/not student accounts/i);
  });
});

describe('a pasted attendee list', () => {
  it('matches students by email and reports the addresses it could not place', async () => {
    const match = await matchWorkshopAttendees(
      `${email('one')}, nobody@example.test\n${email('two')}`,
    );

    expect(match.matched.map((entry) => entry.studentId).sort()).toEqual(
      [studentOne, studentTwo].sort(),
    );
    // Reported rather than dropped: a silently ignored line is a student
    // silently missing from the register.
    expect(match.unmatched).toContain('nobody@example.test');
  });

  it('reads a Zoom-style "Name <address>" export', async () => {
    const match = await matchWorkshopAttendees(`Workshop One <${email('one')}>`);
    expect(match.matched).toHaveLength(1);
  });

  it('notices an address listed twice', async () => {
    const match = await matchWorkshopAttendees(`${email('one')} ${email('one')}`);

    expect(match.matched).toHaveLength(1);
    expect(match.duplicates).toEqual([email('one')]);
  });

  it('writes nothing by itself', async () => {
    const before = await models.WorkshopAttendance.countDocuments({
      workshopId: publishedId,
    }).exec();

    await matchWorkshopAttendees(email('one'));

    expect(await models.WorkshopAttendance.countDocuments({ workshopId: publishedId }).exec()).toBe(
      before,
    );
  });

  it('refuses a list with no addresses in it', async () => {
    await expect(matchWorkshopAttendees('nothing here')).rejects.toThrow(/no email addresses/i);
  });
});

describe('the summary', () => {
  it('counts marks per workshop and never against the cohort', async () => {
    const board = await getWorkshopAttendanceBoard({ q: `Published Talk ${SUFFIX}` });
    const row = board.rows[0]!;

    expect(row._id).toBe(publishedId);
    expect(row.records).toBe(row.present + row.absent);
    // A register nobody has taken is not 0% attendance.
    expect(row.attendanceRate).toBe(Math.round((row.present / row.records) * 100));
  });

  it('says a draft cannot be marked rather than hiding it', async () => {
    const board = await getWorkshopAttendanceBoard({ q: `Draft Talk ${SUFFIX}` });

    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]!.markable).toBe(false);
    expect(board.rows[0]!.records).toBe(0);
    expect(board.rows[0]!.attendanceRate).toBeNull();
  });

  it('separates the people invited from the marks recorded', async () => {
    const board = await getWorkshopAttendanceBoard({ q: `Published Talk ${SUFFIX}` });
    const row = board.rows[0]!;

    // Conflating these is what hides the students nobody has marked.
    expect(row.expected).toBeGreaterThanOrEqual(2);
    expect(row.unmarked).toBe(row.expected - row.records);
  });
});

describe('what a student sees', () => {
  it('returns their own mark, keyed by workshop', async () => {
    const marks = await getStudentWorkshopAttendance(studentTwo);

    expect(marks.get(publishedId)?.status).toBe('PRESENT');
  });

  it('returns nothing for a student nobody has marked', async () => {
    const marks = await getStudentWorkshopAttendance(studentOne);

    // Cleared earlier in this spec — unmarked is the absence of a row, so
    // there is nothing to show rather than an "absent" to show.
    expect(marks.get(publishedId)).toBeUndefined();
  });
});
