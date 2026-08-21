/**
 * The admin edit paths, against a real MongoDB.
 *
 * Three record types gained an edit form: accounts, subjects and classes. All
 * three go through the same rule — an empty field clears the value, an absent
 * one is left alone — and all three had update functions that could not clear
 * anything at all before. That is what these pin.
 *
 * Fixtures are created here and removed in `afterAll`.
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
const { createUser, updateUser } = await import('@/services/users/userService');
const { createSubject, updateSubject, createSubjectSession, updateSubjectSession } =
  await import('@/services/academic/academicService');

const SUFFIX = `adm-${Date.now()}`;

let studentId: string;
let facultyId: string;
let otherFacultyId: string;
let termId: string;
let subjectId: string;
let sessionId: string;

beforeAll(async () => {
  await connectToDatabase();

  const term = await models.Term.findOne().select('_id').lean().exec();
  if (!term) throw new Error('Run `npm run seed` before the integration tests.');
  termId = term._id.toString();

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Admin Edit Student',
      email: `student.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: { rollNumber: `ADM-${SUFFIX}`, batch: '2026', cluster: 'A' },
    })
  ).userId;

  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Admin Edit Faculty',
      email: `faculty.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: { designation: 'Professor', department: 'Strategy' },
    })
  ).userId;

  otherFacultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Replacement Faculty',
      email: `faculty2.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  subjectId = (
    await createSubject({
      code: `AE${SUFFIX.slice(-4)}`,
      name: 'Before rename',
      credits: 3,
      area: 'Strategy',
      termId,
      description: 'A description that will be deleted',
      status: 'ACTIVE',
    })
  )._id.toString();

  sessionId = (
    await createSubjectSession({
      subjectId,
      facultyId,
      date: new Date('2026-09-01T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '10:30',
      sessionType: 'LECTURE',
      supportActivityId: null,
      topic: 'A topic that will be deleted',
      notes: '',
    })
  )._id.toString();
});

afterAll(async () => {
  const userIds = [studentId, facultyId, otherFacultyId].filter(Boolean);

  await models.SubjectAttendance.deleteMany({ sessionId }).exec();
  await models.SubjectSession.deleteMany({ _id: sessionId }).exec();
  await models.SubjectFacultyAssignment.deleteMany({ subjectId }).exec();
  await models.Subject.deleteMany({ _id: subjectId }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.FacultyProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('editing an account', () => {
  it('changes the name, phone and status', async () => {
    await updateUser(studentId, {
      name: 'Renamed Student',
      phone: '+91 90000 00001',
      status: 'INACTIVE',
    });

    const user = await models.User.findById(studentId).lean().exec();
    expect(user!.name).toBe('Renamed Student');
    expect(user!.phone).toBe('+91 90000 00001');
    expect(user!.status).toBe('INACTIVE');
  });

  it('edits the role profile', async () => {
    await updateUser(studentId, { profile: { batch: '2027' } });

    const profile = await models.StudentProfile.findOne({ userId: studentId }).lean().exec();
    expect(profile!.batch).toBe('2027');
    // Untouched fields survive a partial edit.
    expect(profile!.cluster).toBe('A');
  });

  it('clears a profile field submitted empty', async () => {
    await updateUser(studentId, { profile: { cluster: '' } });

    const profile = await models.StudentProfile.findOne({ userId: studentId }).lean().exec();
    expect(profile!.cluster).toBeUndefined();
    // And does not take the required fields with it.
    expect(profile!.rollNumber).toBeTruthy();
    expect(profile!.batch).toBe('2027');
  });

  it('never changes the email, which is the sign-in identity', async () => {
    // The schema does not carry an email at all, so there is nothing for a
    // crafted post to reach. Moving an account to another inbox must not be
    // something an edit form can do.
    const crafted = {
      name: 'Renamed Again',
      email: 'attacker@example.test',
    } as unknown as Parameters<typeof updateUser>[1];

    await updateUser(studentId, crafted);

    const user = await models.User.findById(studentId).lean().exec();
    expect(user!.email).toBe(`student.${SUFFIX}@example.test`);
  });

  it('refuses a user that is not there', async () => {
    await expect(updateUser('000000000000000000000000', { name: 'Ghost' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('editing a subject', () => {
  it('renames it and keeps the fields it was not given', async () => {
    await updateSubject(subjectId, { name: 'After rename' });

    const subject = await models.Subject.findById(subjectId).lean().exec();
    expect(subject!.name).toBe('After rename');
    expect(subject!.area).toBe('Strategy');
    expect(subject!.credits).toBe(3);
  });

  it('clears a description submitted empty', async () => {
    await updateSubject(subjectId, { description: '' });

    const subject = await models.Subject.findById(subjectId).lean().exec();
    expect(subject!.description).toBeUndefined();
  });

  it('still refuses a duplicate code', async () => {
    const existing = await models.Subject.findOne({ _id: { $ne: subjectId } })
      .select('code')
      .lean()
      .exec();

    if (existing) {
      await expect(updateSubject(subjectId, { code: existing.code })).rejects.toThrow(
        /already exists/i,
      );
    }
  });
});

describe('editing a class', () => {
  it('moves it to another faculty member and time', async () => {
    await updateSubjectSession(sessionId, {
      facultyId: otherFacultyId,
      startTime: '14:00',
      endTime: '15:30',
    });

    const session = await models.SubjectSession.findById(sessionId).lean().exec();
    expect(session!.facultyId.toString()).toBe(otherFacultyId);
    expect(session!.startTime).toBe('14:00');
  });

  it('clears a topic submitted empty', async () => {
    await updateSubjectSession(sessionId, { topic: '' });

    const session = await models.SubjectSession.findById(sessionId).lean().exec();
    expect(session!.topic).toBeUndefined();
  });

  it('keeps the class on its own subject', async () => {
    // The subject is not editable: a class belongs to a subject the way a
    // chapter belongs to a book, and moving one would leave its attendance
    // pointing at something that is no longer the same class.
    const session = await models.SubjectSession.findById(sessionId).lean().exec();
    expect(session!.subjectId.toString()).toBe(subjectId);
  });
});
